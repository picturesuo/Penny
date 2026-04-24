import { createHash, createHmac } from "node:crypto";
import { buildCalibrationDashboard, captureSnapshotForMap } from "@/lib/penny-insights";
import type { ThoughtMapModel } from "@/types/thought-map";
import type {
  BrierHistoryPoint,
  CalibrationAchievement,
  CalibrationStreak,
  CalibrationTrackRecord,
  DomainRecord,
  PredictionOutcome,
  PredictionRecord,
  ShareableTrackRecord,
} from "@/types/calibration-record";
import { calculateBrierScore } from "@/lib/calibration";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function average(values: number[]) {
  if (!values.length) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function daysBetween(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function confidenceBucketLabel(confidence: number) {
  const normalized = clamp(confidence, 0, 100);
  const start = Math.floor(normalized / 10) * 10;
  const end = Math.min(100, start + 10);
  return `${start}-${end}%`;
}

function hashContent(content: string, secret: string | null) {
  if (secret) {
    return createHmac("sha256", secret).update(content).digest("hex");
  }

  return createHash("sha256").update(content).digest("hex");
}

function mapOutcome(status: string, resolutionDate: Date | null): PredictionOutcome {
  if (status === "resolved") {
    return "correct";
  }

  if (status === "abandoned") {
    return "incorrect";
  }

  if (status === "stale") {
    return "inconclusive";
  }

  if (resolutionDate && resolutionDate.getTime() <= Date.now()) {
    return "inconclusive";
  }

  return "pending";
}

function outcomeProbability(outcome: PredictionOutcome) {
  switch (outcome) {
    case "correct":
      return 1;
    case "incorrect":
      return 0;
    case "partial":
      return 0.75;
    case "inconclusive":
      return 0.5;
    case "pending":
    default:
      return null;
  }
}

function buildPredictionRecords(maps: ThoughtMapModel[]): PredictionRecord[] {
  return maps.flatMap((map) => {
    const capture = captureSnapshotForMap(map);

    if (!capture) {
      return [];
    }

    const statedAt = capture.updatedAt instanceof Date ? capture.updatedAt : new Date(capture.updatedAt);
    const resolutionDate = capture.resolutionDate ? new Date(capture.resolutionDate) : null;
    const resolvedAt = capture.status === "resolved" || capture.status === "abandoned" || capture.status === "stale" ? statedAt : null;
    const outcome = mapOutcome(capture.status, resolutionDate);
    const confidence = clamp(capture.confidence, 0, 100);
    const actualProbability = outcomeProbability(outcome);
    const brierScore = actualProbability == null ? null : calculateBrierScore(confidence / 100, actualProbability);
    const clampedConfidence = clamp(confidence / 100, 0.01, 0.99);
    const logScore =
      actualProbability == null
        ? null
        : Number((-(actualProbability * Math.log(clampedConfidence) + (1 - actualProbability) * Math.log(1 - clampedConfidence))).toFixed(4));
    const content = `${capture.title}|${confidence}|${statedAt.toISOString()}`;

    return [
      {
        id: map.id,
        userId: map.userId,
        claimId: map.id,
        claimText: capture.title,
        domain: buildCalibrationDashboard([map]).domains[0]?.domain ?? "general",
        statedConfidence: confidence,
        statedAt,
        resolutionDate,
        resolvedAt,
        outcome,
        brierScore,
        logScore,
        calibrationContribution: brierScore == null ? null : Number((1 - brierScore).toFixed(3)),
        contentHash: hashContent(content, process.env.CALIBRATION_TRACK_SECRET ?? null),
        hashVerifiedAt: new Date(),
      },
    ];
  });
}

function buildBrierHistory(predictions: PredictionRecord[]): BrierHistoryPoint[] {
  const resolved = predictions
    .filter((prediction) => prediction.brierScore != null && prediction.resolvedAt != null)
    .sort((a, b) => a.resolvedAt!.getTime() - b.resolvedAt!.getTime());

  return resolved.map((prediction, index) => {
    const windowStart = Math.max(0, index - 9);
    const window = resolved.slice(windowStart, index + 1);
    const rollingAverage = window.reduce((sum, item) => sum + (item.brierScore ?? 0), 0) / window.length;

    return {
      date: prediction.resolvedAt!,
      brierScore: prediction.brierScore ?? 0,
      rollingAverage: Number(rollingAverage.toFixed(3)),
      predictionCount: index + 1,
    };
  });
}

function buildDomainBreakdown(predictions: PredictionRecord[]): DomainRecord[] {
  const domainBuckets = new Map<string, PredictionRecord[]>();

  for (const prediction of predictions) {
    const bucket = domainBuckets.get(prediction.domain) ?? [];
    bucket.push(prediction);
    domainBuckets.set(prediction.domain, bucket);
  }

  return Array.from(domainBuckets.entries())
    .map(([domain, domainPredictions]) => {
      const resolved = domainPredictions.filter((prediction) => prediction.brierScore != null);
      const brierScore = resolved.length
        ? Number((resolved.reduce((sum, prediction) => sum + (prediction.brierScore ?? 0), 0) / resolved.length).toFixed(3))
        : null;
      const predictionCount = domainPredictions.length;
      const resolvedCount = resolved.length;
      const averageConfidence = average(domainPredictions.map((prediction) => prediction.statedConfidence)) ?? 0;
      const resolvedOutcomeRate = resolved.length
        ? average(
            resolved.map((prediction) => {
              if (prediction.outcome === "correct") {
                return 1;
              }

              if (prediction.outcome === "incorrect") {
                return 0;
              }

              if (prediction.outcome === "partial") {
                return 0.75;
              }

              if (prediction.outcome === "inconclusive") {
                return 0.5;
              }

              return 0;
            }),
          )
        : null;
      const systematicError: DomainRecord["systematicError"] =
        resolvedCount < 3 || resolvedOutcomeRate == null
          ? "insufficient_data"
          : averageConfidence / 100 - resolvedOutcomeRate > 0.05
            ? "overconfident"
            : resolvedOutcomeRate - averageConfidence / 100 > 0.05
              ? "underconfident"
              : "well_calibrated";
      const errorMagnitude =
        resolvedOutcomeRate == null ? 0 : Number(Math.abs(averageConfidence / 100 - resolvedOutcomeRate).toFixed(3));
      const trend = (() => {
        if (resolved.length < 4) {
          return "stable" as const;
        }

        const ordered = [...resolved].sort((a, b) => a.resolvedAt!.getTime() - b.resolvedAt!.getTime());
        const midpoint = Math.max(1, Math.floor(ordered.length / 2));
        const earlier = ordered.slice(0, midpoint);
        const recent = ordered.slice(midpoint);
        const averageBrier = (items: PredictionRecord[]) =>
          items.reduce((sum, prediction) => sum + (prediction.brierScore ?? 0), 0) / items.length;
        const earlierAverage = averageBrier(earlier);
        const recentAverage = averageBrier(recent);

        if (earlierAverage - recentAverage > 0.03) {
          return "improving" as const;
        }

        if (recentAverage - earlierAverage > 0.03) {
          return "degrading" as const;
        }

        return "stable" as const;
      })();

      return {
        domain,
        predictionCount,
        resolvedCount,
        brierScore,
        systematicError,
        errorMagnitude,
        trend,
        bestPrediction:
          resolved.length > 0
            ? [...resolved].sort((a, b) => (a.brierScore ?? 1) - (b.brierScore ?? 1))[0] ?? null
            : null,
        worstPrediction:
          resolved.length > 0
            ? [...resolved].sort((a, b) => (b.brierScore ?? 0) - (a.brierScore ?? 0))[0] ?? null
            : null,
      };
    })
    .sort((a, b) => a.domain.localeCompare(b.domain));
}

function buildStreaks(predictions: PredictionRecord[]): CalibrationStreak[] {
  const resolved = predictions.filter((prediction) => prediction.brierScore != null);
  const streaks: CalibrationStreak[] = [];

  if (!resolved.length) {
    return [
      {
        type: "active_predicting",
        length: predictions.length,
        startDate: predictions[0]?.statedAt ?? new Date(),
        active: true,
      },
    ];
  }

  const averageBrier = resolved.reduce((sum, prediction) => sum + (prediction.brierScore ?? 0), 0) / resolved.length;
  const recentWindow = resolved.slice(-5);
  const recentAverage = recentWindow.reduce((sum, prediction) => sum + (prediction.brierScore ?? 0), 0) / recentWindow.length;

  if (averageBrier < 0.2) {
    streaks.push({
      type: "well_calibrated",
      length: resolved.length,
      startDate: resolved[0]!.resolvedAt ?? resolved[0]!.statedAt,
      active: true,
    });
  }

  if (recentAverage < averageBrier - 0.05) {
    streaks.push({
      type: "improving",
      length: recentWindow.length,
      startDate: recentWindow[0]!.resolvedAt ?? recentWindow[0]!.statedAt,
      active: true,
    });
  }

  streaks.push({
    type: "active_predicting",
    length: predictions.length,
    startDate: predictions[0]!.statedAt,
    active: true,
  });

  return streaks;
}

function buildAchievements(predictions: PredictionRecord[]): CalibrationAchievement[] {
  const achievements: CalibrationAchievement[] = [];
  const resolved = predictions.filter((prediction) => prediction.brierScore != null);
  const overallBrier = resolved.length ? resolved.reduce((sum, prediction) => sum + (prediction.brierScore ?? 0), 0) / resolved.length : null;
  const existingTypes = new Set<CalibrationAchievement["type"]>();

  const maybeAdd = (check: {
    type: CalibrationAchievement["type"];
    condition: boolean;
    label: string;
    description: string;
    claimContext: string | null;
  }) => {
    if (!check.condition || existingTypes.has(check.type)) {
      return;
    }

    existingTypes.add(check.type);
    achievements.push({
      id: `${check.type}-${predictions.length}-${achievements.length}`,
      type: check.type,
      label: check.label,
      description: check.description,
      earnedAt: new Date(),
      claimContext: check.claimContext,
    });
  };

  maybeAdd({
    type: "first_prediction",
    condition: predictions.length >= 1,
    label: "First prediction",
    description: "Your calibration log began with a timestamped prediction.",
    claimContext: predictions[0]?.claimText ?? null,
  });

  maybeAdd({
    type: "first_resolution",
    condition: resolved.length >= 1,
    label: "First resolution",
    description: "The record captured its first scored outcome.",
    claimContext: resolved[0]?.claimText ?? null,
  });

  maybeAdd({
    type: "50_predictions",
    condition: predictions.length >= 50,
    label: "50 predictions",
    description: "The record now has enough depth to matter as evidence.",
    claimContext: null,
  });

  maybeAdd({
    type: "brier_under_point2",
    condition: overallBrier != null && overallBrier < 0.2 && resolved.length >= 10,
    label: "Sharp forecaster",
    description: "Average Brier score is below 0.20 across a meaningful sample.",
    claimContext: null,
  });

  const expertDomain = buildDomainBreakdown(predictions).find((domain) => domain.resolvedCount >= 8 && domain.brierScore != null && domain.brierScore < 0.18);
  maybeAdd({
    type: "domain_expert",
    condition: expertDomain != null,
    label: "Domain expert",
    description: `One domain is now a clearly stronger calibration lane: ${expertDomain?.domain}.`,
    claimContext: expertDomain?.bestPrediction?.claimText ?? null,
  });

  const firstPrediction = predictions[0];
  const lastPrediction = predictions[predictions.length - 1];
  if (firstPrediction) {
    maybeAdd({
      type: "6_month_track_record",
      condition: daysBetween(firstPrediction.statedAt, lastPrediction?.statedAt ?? new Date()) >= 180,
      label: "6-month track record",
      description: "The record has lived long enough to show a persistent pattern.",
      claimContext: null,
    });

    maybeAdd({
      type: "1_year_track_record",
      condition: daysBetween(firstPrediction.statedAt, lastPrediction?.statedAt ?? new Date()) >= 365,
      label: "1-year track record",
      description: "This has become a durable intellectual history rather than a short burst.",
      claimContext: null,
    });
  }

  if (resolved.length >= 10) {
    const earliestAverage = average(resolved.slice(0, Math.min(5, resolved.length)).map((prediction) => prediction.brierScore ?? 0)) ?? 0;
    const latestAverage = average(resolved.slice(-Math.min(5, resolved.length)).map((prediction) => prediction.brierScore ?? 0)) ?? 0;

    maybeAdd({
      type: "improved_10_points",
      condition: earliestAverage - latestAverage >= 0.1,
      label: "Improved 10 points",
      description: "Recent calibration improved by at least 0.10 Brier compared with the early record.",
      claimContext: null,
    });
  }

  maybeAdd({
    type: "consistent_calibrator",
    condition: resolved.length >= 15 && overallBrier != null && overallBrier <= 0.2,
    label: "Consistent calibrator",
    description: "The overall record is now stable enough to read as a repeatable skill.",
    claimContext: null,
  });

  return achievements;
}

function buildBrierCurve(predictions: PredictionRecord[]) {
  return predictions
    .filter((prediction) => prediction.brierScore != null)
    .sort((a, b) => a.statedAt.getTime() - b.statedAt.getTime())
    .map((prediction, index, resolved) => {
      const windowStart = Math.max(0, index - 9);
      const window = resolved.slice(windowStart, index + 1);
      const rollingAverage = window.reduce((sum, item) => sum + (item.brierScore ?? 0), 0) / window.length;

      return {
        date: prediction.statedAt,
        confidenceBucket: confidenceBucketLabel(prediction.statedConfidence),
        brierScore: prediction.brierScore ?? 0,
        rollingAverage: Number(rollingAverage.toFixed(3)),
        predictionCount: index + 1,
      };
    });
}

export function buildCalibrationTrackRecord(maps: ThoughtMapModel[]): CalibrationTrackRecord {
  const predictions = buildPredictionRecords(maps);
  const resolvedPredictions = predictions.filter((prediction) => prediction.brierScore != null);
  const firstPrediction = predictions[0] ?? null;
  const lastUpdated = predictions.reduce((latest, prediction) =>
    prediction.statedAt.getTime() > latest.getTime() ? prediction.statedAt : latest,
  new Date(0));
  const trackRecordStartDate = firstPrediction?.statedAt ?? new Date();
  const overallBrierScore = resolvedPredictions.length
    ? Number((resolvedPredictions.reduce((sum, prediction) => sum + (prediction.brierScore ?? 0), 0) / resolvedPredictions.length).toFixed(3))
    : null;

  return {
    userId: maps[0]?.userId ?? "unknown",
    totalPredictions: predictions.length,
    resolvedPredictions: resolvedPredictions.length,
    pendingPredictions: predictions.length - resolvedPredictions.length,
    overallBrierScore,
    brierScorePercentile: null,
    domainBreakdown: buildDomainBreakdown(predictions),
    calibrationCurve: buildBrierCurve(predictions),
    brierScoreHistory: buildBrierHistory(predictions),
    streaks: buildStreaks(predictions),
    notableAchievements: buildAchievements(predictions),
    trackRecordStartDate,
    trackRecordAge: daysBetween(trackRecordStartDate, lastUpdated),
    lastUpdated: lastUpdated.getTime() > 0 ? lastUpdated : trackRecordStartDate,
  };
}

export function buildShareableTrackRecord(
  record: CalibrationTrackRecord,
  displayName: string,
  secret?: string | null,
): ShareableTrackRecord {
  const generatedAt = new Date();
  const payload = {
    userId: record.userId,
    displayName,
    trackRecordAge: formatTrackRecordAge(record.trackRecordAge),
    totalPredictions: record.totalPredictions,
    resolvedPredictions: record.resolvedPredictions,
    overallBrierScore: record.overallBrierScore,
    brierPercentile: record.brierScorePercentile,
    domainBreakdown: record.domainBreakdown,
    notableAchievements: record.notableAchievements,
    generatedAt,
  };
  const content = JSON.stringify(payload);

  return {
    ...payload,
    signature: secret
      ? createHmac("sha256", secret).update(content).digest("hex")
      : createHash("sha256").update(content).digest("hex"),
  };
}

function formatTrackRecordAge(days: number) {
  if (days < 30) {
    return `${days} days`;
  }

  if (days < 365) {
    return `${Math.floor(days / 30)} months`;
  }

  return `${Math.floor(days / 365)} year${days >= 730 ? "s" : ""}`;
}
