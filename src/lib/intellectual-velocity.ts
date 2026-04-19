import { buildBlindSpotMap, buildCalibrationDashboard, buildMemoryTimeDashboard } from "@/lib/penny-insights";
import { listThoughtMaps } from "@/server/thought-map";
import type { VelocityDirection, VelocityMetric, VelocityTrend, IntellectualVelocityReport, CompoundingSignal } from "@/types/intellectual-velocity";
import type { ThoughtMapModel } from "@/types/thought-map";

const DEFAULT_PERIOD_DAYS = 30;
const MIN_PERIOD_DAYS = 7;
const MAX_PERIOD_DAYS = 365;

type MetricKey = string;

type PeriodSnapshot = {
  maps: ThoughtMapModel[];
  mapCount: number;
  totalClaims: number;
  updatedNodes: number;
  dialecticRounds: number;
  averageRoundsPerMap: number;
  averageUpdatesPerMap: number;
  calibrationBrier: number | null;
  blindSpotCoverage: number;
  critiqueSophistication: number | null;
  evidenceQuality: number | null;
  revisionLatency: number | null;
  structuralHealth: number | null;
  untestedHighConfidenceClaims: number;
  unexaminedDomains: number;
  weakNodes: number;
  calibrationSamples: number;
  steelManSamples: number;
  evidenceSamples: number;
  revisionLatencySamples: number;
  graphHealthSamples: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function average(values: Array<number | null | undefined>) {
  const filtered = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (!filtered.length) {
    return null;
  }

  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function weightedAverage(values: Array<{ value: number | null; weight: number }>) {
  const usable = values.filter((entry): entry is { value: number; weight: number } => typeof entry.value === "number" && Number.isFinite(entry.value) && entry.weight > 0);

  if (!usable.length) {
    return null;
  }

  const totalWeight = usable.reduce((sum, entry) => sum + entry.weight, 0);

  if (totalWeight <= 0) {
    return null;
  }

  return usable.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / totalWeight;
}

function subDays(date: Date, days: number) {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}

function inRange(date: Date, start: Date, end: Date) {
  return date.getTime() >= start.getTime() && date.getTime() < end.getTime();
}

function round(value: number, precision = 1) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? `${value}` : `${round(value, 1)}`;
}

function trendForDelta(delta: number, threshold: number) {
  if (Math.abs(delta) <= threshold) {
    return "stable";
  }

  if (delta > threshold * 2) {
    return "accelerating";
  }

  if (delta > 0) {
    return "improving";
  }

  return "declining";
}

function directionDelta(metric: { currentValue: number; previousValue: number; direction: VelocityDirection }) {
  return metric.direction === "higher_is_better" ? metric.currentValue - metric.previousValue : metric.previousValue - metric.currentValue;
}

function metricScore(metric: VelocityMetric, sampleCount: number) {
  if (sampleCount <= 0) {
    return 50;
  }

  switch (metric.id) {
    case "calibration-improvement":
      return clamp(100 - metric.currentValue * 100, 0, 100);
    case "engagement-depth":
      return clamp(metric.currentValue / 6, 0, 1) * 100;
    case "update-rate":
      return clamp(metric.currentValue / 4, 0, 1) * 100;
    case "blind-spot-coverage":
      return clamp(metric.currentValue, 0, 100);
    case "critique-sophistication":
      return clamp(metric.currentValue / 10, 0, 1) * 100;
    case "evidence-quality-avg":
      return clamp(metric.currentValue / 5, 0, 1) * 100;
    case "belief-revision-latency":
      return clamp(100 - metric.currentValue / 6 * 100, 0, 100);
    case "structural-health-trend":
      return clamp(metric.currentValue, 0, 100);
    default:
      return 50;
  }
}

function currentPeriodMaps(maps: ThoughtMapModel[], start: Date, end: Date) {
  return maps.filter((map) => inRange(map.updatedAt, start, end)).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

function extractEvidenceQuality(map: ThoughtMapModel) {
  const profile = map.critiqueQualityProfile;

  if (!profile) {
    return null;
  }

  const preferredKeys = [
    "evidence",
    "evidential_basis",
    "evidentiary_basis",
    "source_quality",
    "source",
    "falsification",
    "falsification_basis",
  ];

  for (const key of preferredKeys) {
    const value = profile.dimensionAverages[key];

    if (typeof value === "number") {
      return value;
    }
  }

  const values = Object.values(profile.dimensionAverages);
  return average(values);
}

function snapshotPeriod(userId: string, maps: ThoughtMapModel[]): PeriodSnapshot {
  const calibration = buildCalibrationDashboard(maps);
  const memory = buildMemoryTimeDashboard(maps);
  const blindSpotMap = buildBlindSpotMap(maps, userId);
  const graphSnapshots = maps.map((map) => map.graphSnapshot?.overallScore ?? null);
  const steelManScores = maps.flatMap((map) => map.steelMans.map((steelMan) => steelMan.qualityScore));
  const evidenceScores = maps.map((map) => extractEvidenceQuality(map));
  const claimCount = maps.reduce(
    (sum, map) => sum + map.nodes.filter((node) => node.kind !== "root" && node.nodeStatus !== "superseded").length,
    0,
  );
  const updatedNodes = maps.reduce(
    (sum, map) =>
      sum +
      map.nodes.filter(
        (node) => node.kind !== "root" && node.nodeStatus !== "superseded" && node.updatedAt.getTime() > node.createdAt.getTime(),
      ).length,
    0,
  );
  const dialecticRounds = maps.reduce(
    (sum, map) => sum + map.events.filter((event) => event.eventType === "dialectic_round").length,
    0,
  );
  const revisionLatency = weightedAverage(
    memory.beliefVelocity.map((item) => ({
      value: item.averageLagDays,
      weight: item.sampleSize,
    })),
  );

  return {
    maps,
    mapCount: maps.length,
    totalClaims: claimCount,
    updatedNodes,
    dialecticRounds,
    averageRoundsPerMap: maps.length ? dialecticRounds / maps.length : 0,
    averageUpdatesPerMap: maps.length ? updatedNodes / maps.length : 0,
    calibrationBrier: average(calibration.resolvedClaims.map((claim) => claim.brierScore)),
    blindSpotCoverage:
      claimCount > 0 ? clamp(100 - (blindSpotMap.untestedHighConfidenceClaims.length / claimCount) * 100, 0, 100) : 50,
    critiqueSophistication: average(steelManScores),
    evidenceQuality: average(evidenceScores),
    revisionLatency,
    structuralHealth: average(graphSnapshots),
    untestedHighConfidenceClaims: blindSpotMap.untestedHighConfidenceClaims.length,
    unexaminedDomains: blindSpotMap.unexaminedDomains.length,
    weakNodes: maps.reduce((sum, map) => sum + (map.graphSnapshot?.weakNodes ?? 0), 0),
    calibrationSamples: calibration.resolvedClaims.length,
    steelManSamples: steelManScores.filter((score): score is number => typeof score === "number" && Number.isFinite(score)).length,
    evidenceSamples: evidenceScores.filter((score): score is number => typeof score === "number" && Number.isFinite(score)).length,
    revisionLatencySamples: memory.beliefVelocity.reduce((sum, item) => sum + item.sampleSize, 0),
    graphHealthSamples: graphSnapshots.filter((score): score is number => typeof score === "number" && Number.isFinite(score)).length,
  };
}

function makeInterpretation(params: {
  current: number;
  previous: number;
  direction: VelocityDirection;
  currentSampleCount: number;
  improvedPhrase: string;
  declinedPhrase: string;
  neutralPhrase: string;
}) {
  const delta = directionDelta({ currentValue: params.current, previousValue: params.previous, direction: params.direction });

  if (params.currentSampleCount <= 0) {
    return params.neutralPhrase;
  }

  if (delta > 0) {
    return params.improvedPhrase;
  }

  if (delta < 0) {
    return params.declinedPhrase;
  }

  return params.neutralPhrase;
}

function buildMetric(params: {
  id: MetricKey;
  userId: string;
  metricName: string;
  currentValue: number;
  previousValue: number;
  unit: string;
  direction: VelocityDirection;
  computedOverDays: number;
  interpretation: string;
}): VelocityMetric {
  const delta = directionDelta(params);
  return {
    id: params.id,
    userId: params.userId,
    metricName: params.metricName,
    currentValue: params.currentValue,
    previousValue: params.previousValue,
    unit: params.unit,
    direction: params.direction,
    trend: trendForDelta(delta, params.unit === "%" ? 3 : params.unit === "Brier" ? 0.015 : params.unit === "/ 100" ? 4 : 0.5),
    trendMagnitude: Math.abs(delta),
    computedAt: new Date(),
    computedOverDays: params.computedOverDays,
    interpretation: params.interpretation,
    percentile: null,
  };
}

function buildNarrative(report: IntellectualVelocityReport, current: PeriodSnapshot, prior: PeriodSnapshot) {
  if (current.mapCount === 0 && prior.mapCount === 0) {
    return "There is not enough history yet to measure compounding. Once Penny has more updates, the dashboard will show how quickly your thinking is changing.";
  }

  const strongestSignal = report.compoundingSignals.slice().sort((a, b) => b.magnitude - a.magnitude)[0] ?? null;
  const trendClause =
    report.overallTrend === "accelerating"
      ? "is accelerating"
      : report.overallTrend === "improving"
        ? "is improving"
        : report.overallTrend === "declining"
          ? "has slowed"
          : "is holding steady";

  const lines = [`Your intellectual velocity ${trendClause}.`];

  if (strongestSignal) {
    lines.push(`The clearest compounding signal is ${strongestSignal.description.toLowerCase()}.`);
  }

  if (report.metrics.calibrationImprovement.trend !== "stable") {
    lines.push(
      report.metrics.calibrationImprovement.currentValue < report.metrics.calibrationImprovement.previousValue
        ? "Your calibration window is moving in the right direction."
        : "Your calibration window is getting looser, so the next window should be more deliberate.",
    );
  }

  if (current.blindSpotCoverage > prior.blindSpotCoverage) {
    lines.push("More of your high-confidence claims are being tested before they calcify.");
  }

  if (current.revisionLatency != null && prior.revisionLatency != null && current.revisionLatency < prior.revisionLatency) {
    lines.push("You are revising earlier when strong critique lands.");
  }

  return lines.join(" ");
}

function buildCompoundingSignals(current: PeriodSnapshot, prior: PeriodSnapshot, metrics: IntellectualVelocityReport["metrics"]): CompoundingSignal[] {
  const signals: CompoundingSignal[] = [];

  if (metrics.critiqueSophistication.trend !== "stable" && metrics.critiqueSophistication.trendMagnitude >= 0.5 && metrics.critiqueSophistication.direction === "higher_is_better" && metrics.critiqueSophistication.currentValue > metrics.critiqueSophistication.previousValue) {
    signals.push({
      signalType: "critique_quality_improving",
      description: "Your critiques are getting more sophisticated.",
      evidence: `Steel-man quality rose from ${formatNumber(metrics.critiqueSophistication.previousValue)} to ${formatNumber(metrics.critiqueSophistication.currentValue)}.`,
      magnitude: metrics.critiqueSophistication.trendMagnitude,
      detectedAt: new Date(),
    });
  }

  if (prior.untestedHighConfidenceClaims > current.untestedHighConfidenceClaims) {
    signals.push({
      signalType: "fewer_stale_claims",
      description: "Fewer high-confidence claims are sitting untested.",
      evidence: `${prior.untestedHighConfidenceClaims} untested claims fell to ${current.untestedHighConfidenceClaims}.`,
      magnitude: prior.untestedHighConfidenceClaims - current.untestedHighConfidenceClaims,
      detectedAt: new Date(),
    });
  }

  if (metrics.engagementDepth.trend !== "stable" && metrics.engagementDepth.currentValue > metrics.engagementDepth.previousValue) {
    signals.push({
      signalType: "deeper_engagement",
      description: "You are staying with critique for longer.",
      evidence: `Dialectic depth moved from ${formatNumber(metrics.engagementDepth.previousValue)} to ${formatNumber(metrics.engagementDepth.currentValue)} rounds per map.`,
      magnitude: metrics.engagementDepth.trendMagnitude,
      detectedAt: new Date(),
    });
  }

  if (metrics.updateRate.trend !== "stable" && metrics.updateRate.currentValue > metrics.updateRate.previousValue) {
    signals.push({
      signalType: "faster_updates",
      description: "You are revisiting and updating claims more quickly.",
      evidence: `Update rate rose from ${formatNumber(metrics.updateRate.previousValue)} to ${formatNumber(metrics.updateRate.currentValue)} updated nodes per map.`,
      magnitude: metrics.updateRate.trendMagnitude,
      detectedAt: new Date(),
    });
  }

  if (current.blindSpotCoverage > prior.blindSpotCoverage) {
    signals.push({
      signalType: "broader_coverage",
      description: "A larger share of your claim surface is under stress-test.",
      evidence: `Coverage improved from ${formatNumber(prior.blindSpotCoverage)}% to ${formatNumber(current.blindSpotCoverage)}%.`,
      magnitude: current.blindSpotCoverage - prior.blindSpotCoverage,
      detectedAt: new Date(),
    });
  }

  if (metrics.calibrationImprovement.currentValue < metrics.calibrationImprovement.previousValue) {
    signals.push({
      signalType: "better_calibration",
      description: "Your forecast quality is tightening.",
      evidence: `Average Brier score fell from ${formatNumber(metrics.calibrationImprovement.previousValue)} to ${formatNumber(metrics.calibrationImprovement.currentValue)}.`,
      magnitude: metrics.calibrationImprovement.previousValue - metrics.calibrationImprovement.currentValue,
      detectedAt: new Date(),
    });
  }

  if (current.structuralHealth != null && prior.structuralHealth != null && current.structuralHealth > prior.structuralHealth && current.weakNodes < prior.weakNodes) {
    signals.push({
      signalType: "shapes_weakening",
      description: "Weak reasoning shapes are losing force.",
      evidence: `Structural health rose while weak nodes dropped from ${prior.weakNodes} to ${current.weakNodes}.`,
      magnitude: (current.structuralHealth ?? 0) - (prior.structuralHealth ?? 0),
      detectedAt: new Date(),
    });
  }

  return signals.sort((a, b) => b.magnitude - a.magnitude);
}

function overallTrendFromScores(currentScore: number, previousScore: number): VelocityTrend {
  const delta = currentScore - previousScore;

  if (Math.abs(delta) <= 2.5) {
    return "stable";
  }

  if (delta > 6) {
    return "accelerating";
  }

  if (delta > 0) {
    return "improving";
  }

  return "declining";
}

function buildReport(userId: string, maps: ThoughtMapModel[], periodDays: number): IntellectualVelocityReport {
  const now = new Date();
  const currentPeriodEnd = now;
  const currentPeriodStart = subDays(currentPeriodEnd, periodDays);
  const priorPeriodEnd = currentPeriodStart;
  const priorPeriodStart = subDays(priorPeriodEnd, periodDays);
  const userMaps = maps.filter((map) => map.userId === userId);
  const currentMaps = currentPeriodMaps(userMaps, currentPeriodStart, currentPeriodEnd);
  const priorMaps = currentPeriodMaps(userMaps, priorPeriodStart, priorPeriodEnd);
  const current = snapshotPeriod(userId, currentMaps);
  const prior = snapshotPeriod(userId, priorMaps);

  const calibrationImprovement = buildMetric({
    id: "calibration-improvement",
    userId,
    metricName: "Calibration Improvement",
    currentValue: current.calibrationBrier ?? 0,
    previousValue: prior.calibrationBrier ?? 0,
    unit: "Brier",
    direction: "lower_is_better",
    computedOverDays: periodDays,
    interpretation: makeInterpretation({
      current: current.calibrationBrier ?? 0,
      previous: prior.calibrationBrier ?? 0,
      direction: "lower_is_better",
      currentSampleCount: current.calibrationBrier == null ? 0 : currentMaps.length,
      improvedPhrase: "Your recent forecast window is scoring better than the prior one.",
      declinedPhrase: "Your forecast window is looser than the prior one, so the next round should be more deliberate.",
      neutralPhrase: current.calibrationBrier == null ? "No resolved claims yet, so calibration improvement is still waiting on scored history." : "Calibration is holding steady.",
    }),
  });

  const engagementDepth = buildMetric({
    id: "engagement-depth",
    userId,
    metricName: "Engagement Depth",
    currentValue: current.averageRoundsPerMap,
    previousValue: prior.averageRoundsPerMap,
    unit: "rounds / map",
    direction: "higher_is_better",
    computedOverDays: periodDays,
    interpretation: makeInterpretation({
      current: current.averageRoundsPerMap,
      previous: prior.averageRoundsPerMap,
      direction: "higher_is_better",
      currentSampleCount: current.mapCount,
      improvedPhrase: "You are staying with critique longer, which usually means the challenge surface is becoming more real.",
      declinedPhrase: "Engagement is thinning out; the next window should watch for shallow exits.",
      neutralPhrase: current.mapCount === 0 ? "No map history in this window yet." : "Engagement depth is roughly flat.",
    }),
  });

  const updateRate = buildMetric({
    id: "update-rate",
    userId,
    metricName: "Update Rate",
    currentValue: current.averageUpdatesPerMap,
    previousValue: prior.averageUpdatesPerMap,
    unit: "updates / map",
    direction: "higher_is_better",
    computedOverDays: periodDays,
    interpretation: makeInterpretation({
      current: current.averageUpdatesPerMap,
      previous: prior.averageUpdatesPerMap,
      direction: "higher_is_better",
      currentSampleCount: current.mapCount,
      improvedPhrase: "You are revisiting and updating work more often than before.",
      declinedPhrase: "Update rate is cooling off, which can mean the system is getting stuck or the window is quiet.",
      neutralPhrase: current.mapCount === 0 ? "No updated maps in this window yet." : "Update rate is holding steady.",
    }),
  });

  const blindSpotCoverage = buildMetric({
    id: "blind-spot-coverage",
    userId,
    metricName: "Blind Spot Coverage",
    currentValue: current.blindSpotCoverage,
    previousValue: prior.blindSpotCoverage,
    unit: "%",
    direction: "higher_is_better",
    computedOverDays: periodDays,
    interpretation: makeInterpretation({
      current: current.blindSpotCoverage,
      previous: prior.blindSpotCoverage,
      direction: "higher_is_better",
      currentSampleCount: current.totalClaims,
      improvedPhrase: "A larger share of your claim surface is being tested before it calcifies.",
      declinedPhrase: "More high-confidence claims are slipping through untested.",
      neutralPhrase: current.totalClaims === 0 ? "There are no claims to stress-test yet." : "Blind-spot coverage is roughly flat.",
    }),
  });

  const critiqueSophistication = buildMetric({
    id: "critique-sophistication",
    userId,
    metricName: "Critique Sophistication",
    currentValue: current.critiqueSophistication ?? 0,
    previousValue: prior.critiqueSophistication ?? 0,
    unit: "/ 10",
    direction: "higher_is_better",
    computedOverDays: periodDays,
    interpretation: makeInterpretation({
      current: current.critiqueSophistication ?? 0,
      previous: prior.critiqueSophistication ?? 0,
      direction: "higher_is_better",
      currentSampleCount: current.mapCount,
      improvedPhrase: "Your steel-manning is getting more exact and less generic.",
      declinedPhrase: "Critique quality is slipping and may need more evidence-specific pressure.",
      neutralPhrase: current.mapCount === 0 ? "No steel-man history yet." : "Critique sophistication is holding steady.",
    }),
  });

  const evidenceQualityAvg = buildMetric({
    id: "evidence-quality-avg",
    userId,
    metricName: "Evidence Quality Avg",
    currentValue: current.evidenceQuality ?? 0,
    previousValue: prior.evidenceQuality ?? 0,
    unit: "/ 5",
    direction: "higher_is_better",
    computedOverDays: periodDays,
    interpretation: makeInterpretation({
      current: current.evidenceQuality ?? 0,
      previous: prior.evidenceQuality ?? 0,
      direction: "higher_is_better",
      currentSampleCount: current.mapCount,
      improvedPhrase: "The evidence feeding critiques is becoming more concrete and more useful.",
      declinedPhrase: "Evidence quality is softening, which usually makes the next critique less useful.",
      neutralPhrase: current.mapCount === 0 ? "No critique-quality history yet." : "Evidence quality is holding steady.",
    }),
  });

  const beliefRevisionLatency = buildMetric({
    id: "belief-revision-latency",
    userId,
    metricName: "Belief Revision Latency",
    currentValue: current.revisionLatency ?? 0,
    previousValue: prior.revisionLatency ?? 0,
    unit: "days",
    direction: "lower_is_better",
    computedOverDays: periodDays,
    interpretation: makeInterpretation({
      current: current.revisionLatency ?? 0,
      previous: prior.revisionLatency ?? 0,
      direction: "lower_is_better",
      currentSampleCount: current.revisionLatency == null ? 0 : current.mapCount,
      improvedPhrase: "You are revising sooner after critique lands.",
      declinedPhrase: "Belief revision is taking longer, which can signal resistance or slower evidence flow.",
      neutralPhrase: current.revisionLatency == null ? "There is not enough revision history yet." : "Revision latency is holding steady.",
    }),
  });

  const structuralHealthTrend = buildMetric({
    id: "structural-health-trend",
    userId,
    metricName: "Structural Health Trend",
    currentValue: current.structuralHealth ?? 0,
    previousValue: prior.structuralHealth ?? 0,
    unit: "/ 100",
    direction: "higher_is_better",
    computedOverDays: periodDays,
    interpretation: makeInterpretation({
      current: current.structuralHealth ?? 0,
      previous: prior.structuralHealth ?? 0,
      direction: "higher_is_better",
      currentSampleCount: current.mapCount,
      improvedPhrase: "The map is structurally cleaner than it was in the prior window.",
      declinedPhrase: "Structural health is slipping, usually because weak or critical dependencies are accumulating.",
      neutralPhrase: current.mapCount === 0 ? "No structural-health history yet." : "Structural health is holding steady.",
    }),
  });

  const metrics = {
    calibrationImprovement,
    engagementDepth,
    updateRate,
    blindSpotCoverage,
    critiqueSophistication,
    evidenceQualityAvg,
    beliefRevisionLatency,
    structuralHealthTrend,
  };

  const currentOverallVelocityScore = round(
    (
      metricScore(calibrationImprovement, current.calibrationSamples) * 0.18 +
      metricScore(engagementDepth, current.mapCount) * 0.14 +
      metricScore(updateRate, current.mapCount) * 0.12 +
      metricScore(blindSpotCoverage, current.totalClaims) * 0.16 +
      metricScore(critiqueSophistication, current.steelManSamples) * 0.12 +
      metricScore(evidenceQualityAvg, current.evidenceSamples) * 0.1 +
      metricScore(beliefRevisionLatency, current.revisionLatencySamples) * 0.1 +
      metricScore(structuralHealthTrend, current.graphHealthSamples) * 0.18
    ) / 1,
    0,
  );

  const previousOverallVelocityScore = round(
    (
      metricScore({ ...calibrationImprovement, currentValue: prior.calibrationBrier ?? 0 }, prior.calibrationSamples) * 0.18 +
      metricScore({ ...engagementDepth, currentValue: prior.averageRoundsPerMap, previousValue: prior.averageRoundsPerMap }, prior.mapCount) * 0.14 +
      metricScore({ ...updateRate, currentValue: prior.averageUpdatesPerMap, previousValue: prior.averageUpdatesPerMap }, prior.mapCount) * 0.12 +
      metricScore({ ...blindSpotCoverage, currentValue: prior.blindSpotCoverage, previousValue: prior.blindSpotCoverage }, prior.totalClaims) * 0.16 +
      metricScore({ ...critiqueSophistication, currentValue: prior.critiqueSophistication ?? 0, previousValue: prior.critiqueSophistication ?? 0 }, prior.steelManSamples) * 0.12 +
      metricScore({ ...evidenceQualityAvg, currentValue: prior.evidenceQuality ?? 0, previousValue: prior.evidenceQuality ?? 0 }, prior.evidenceSamples) * 0.1 +
      metricScore({ ...beliefRevisionLatency, currentValue: prior.revisionLatency ?? 0, previousValue: prior.revisionLatency ?? 0 }, prior.revisionLatencySamples) * 0.1 +
      metricScore({ ...structuralHealthTrend, currentValue: prior.structuralHealth ?? 0, previousValue: prior.structuralHealth ?? 0 }, prior.graphHealthSamples) * 0.18
    ) / 1,
    0,
  );

  const signalMetrics = {
    calibrationImprovement,
    engagementDepth,
    updateRate,
    blindSpotCoverage,
    critiqueSophistication,
    evidenceQualityAvg,
    beliefRevisionLatency,
    structuralHealthTrend,
  };

  const report: IntellectualVelocityReport = {
    userId,
    reportDate: now,
    periodDays,
    overallVelocityScore: currentOverallVelocityScore,
    overallTrend: overallTrendFromScores(currentOverallVelocityScore, previousOverallVelocityScore),
    metrics,
    mostImprovedMetric: Object.values(metrics).slice().sort((a, b) => directionDelta(b) - directionDelta(a))[0] ?? calibrationImprovement,
    needsAttentionMetric: Object.values(metrics).slice().sort((a, b) => directionDelta(a) - directionDelta(b))[0] ?? null,
    compoundingSignals: [],
    velocityNarrative: "",
  };

  report.compoundingSignals = buildCompoundingSignals(current, prior, signalMetrics);
  report.velocityNarrative = buildNarrative(report, current, prior);

  return report;
}

export async function computeVelocityReport(userId: string, periodDays = DEFAULT_PERIOD_DAYS) {
  const maps = await listThoughtMaps();
  return buildVelocityReport(userId, maps, periodDays);
}

export function buildVelocityReport(userId: string, maps: ThoughtMapModel[], periodDays = DEFAULT_PERIOD_DAYS) {
  const boundedPeriodDays = clamp(periodDays, MIN_PERIOD_DAYS, MAX_PERIOD_DAYS);
  return buildReport(userId, maps, boundedPeriodDays);
}

export function clampVelocityPeriodDays(periodDays: number) {
  return clamp(periodDays, MIN_PERIOD_DAYS, MAX_PERIOD_DAYS);
}
