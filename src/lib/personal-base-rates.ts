import { buildCalibrationDashboard, captureSnapshotForMap } from "@/lib/penny-insights";
import type { ThoughtMapModel } from "@/types/thought-map";
import type {
  CoverageSummary,
  PersonalBaseRate,
  PersonalBaseRateLibrary,
  PersonalBaseRateTrend,
  TimeToSignificance,
} from "@/types/personal-base-rates";

const MIN_SAMPLE_SIZE = 20;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function asDate(value: string | Date) {
  return value instanceof Date ? value : new Date(value);
}

function confidenceBucketLabel(confidence: number) {
  const normalized = clamp(confidence, 0, 100);
  const start = Math.floor(normalized / 10) * 10;
  const end = Math.min(100, start + 10);
  return `${start}-${end}%`;
}

function confidenceInterval(rate: number, n: number): [number, number] {
  if (n <= 0) {
    return [0, 1];
  }

  const z = 1.96;
  const denominator = 1 + (z * z) / n;
  const center = (rate + (z * z) / (2 * n)) / denominator;
  const margin = (z * Math.sqrt((rate * (1 - rate)) / n + (z * z) / (4 * n * n))) / denominator;
  return [Math.max(0, Number((center - margin).toFixed(3))), Math.min(1, Number((center + margin).toFixed(3)))];
}

function deriveTrend(samples: Array<{ outcome: number; resolvedAt: Date }>): PersonalBaseRateTrend {
  if (samples.length < 4) {
    return "insufficient_data";
  }

  const ordered = [...samples].sort((a, b) => a.resolvedAt.getTime() - b.resolvedAt.getTime());
  const midpoint = Math.max(1, Math.floor(ordered.length / 2));
  const earlier = ordered.slice(0, midpoint);
  const recent = ordered.slice(midpoint);
  const averageOutcome = (items: Array<{ outcome: number }>) => items.reduce((sum, item) => sum + item.outcome, 0) / items.length;
  const earlierAverage = averageOutcome(earlier);
  const recentAverage = averageOutcome(recent);

  if (recentAverage - earlierAverage > 0.08) {
    return "improving";
  }

  if (earlierAverage - recentAverage > 0.08) {
    return "degrading";
  }

  return "stable";
}

function estimatePace(samples: Array<{ resolvedAt: Date }>) {
  if (samples.length < 2) {
    return null;
  }

  const sorted = [...samples].sort((a, b) => a.resolvedAt.getTime() - b.resolvedAt.getTime());
  const first = sorted[0]?.resolvedAt ?? null;
  const last = sorted[sorted.length - 1]?.resolvedAt ?? null;
  if (!first || !last) {
    return null;
  }

  const weeks = Math.max(1 / 7, (last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24 * 7));
  return samples.length / weeks;
}

type PredictionSample = {
  userId: string;
  domain: string;
  claimType: string;
  confidenceBucket: string;
  confidence: number;
  outcome: number;
  resolvedAt: Date;
};

function buildPredictionSamples(maps: ThoughtMapModel[]): PredictionSample[] {
  return maps.flatMap((map) => {
    const capture = captureSnapshotForMap(map);
    if (!capture) {
      return [];
    }

    const domain = buildCalibrationDashboard([map]).domains[0]?.domain ?? "general";
    const claimType = capture.structureKind ?? "assertion";
    const resolvedAt = asDate(capture.updatedAt ?? map.updatedAt);
    const outcome =
      capture.status === "resolved"
        ? 1
        : capture.status === "abandoned"
          ? 0
          : capture.status === "stale"
            ? 0
            : null;

    if (outcome == null) {
      return [];
    }

    return [
      {
        userId: map.userId,
        domain,
        claimType,
        confidenceBucket: confidenceBucketLabel(capture.confidence),
        confidence: clamp(capture.confidence, 0, 100),
        outcome,
        resolvedAt,
      },
    ];
  });
}

function buildBaseRate(
  userId: string,
  domain: string,
  claimType: string,
  confidenceBucket: string,
  samples: PredictionSample[],
): PersonalBaseRate {
  const confirmedCount = samples.filter((sample) => sample.outcome === 1).length;
  const predictionCount = samples.length;
  const empiricalRate = predictionCount ? confirmedCount / predictionCount : 0;
  const lastUpdated = samples
    .map((sample) => sample.resolvedAt)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? new Date();
  const trend = deriveTrend(samples);
  const isStatisticallySignificant = predictionCount >= MIN_SAMPLE_SIZE;
  const useInReferenceClass = isStatisticallySignificant && predictionCount >= 8;

  return {
    id: `${userId}:${domain}:${claimType}:${confidenceBucket}`,
    userId,
    domain,
    claimType,
    confidenceBucket,
    predictionCount,
    confirmedCount,
    empiricalRate: Number(empiricalRate.toFixed(3)),
    isStatisticallySignificant,
    confidenceInterval: confidenceInterval(empiricalRate, predictionCount),
    lastUpdated,
    trend,
    useInReferenceClass,
  };
}

function buildCoverageSummary(rate: PersonalBaseRate, pace: number | null): CoverageSummary {
  const remaining = Math.max(0, MIN_SAMPLE_SIZE - rate.predictionCount);
  const percentToReliability = Math.min(100, Math.round((rate.predictionCount / MIN_SAMPLE_SIZE) * 100));

  return {
    domain: rate.domain,
    claimType: rate.claimType,
    currentCount: rate.predictionCount,
    countNeededForReliability: MIN_SAMPLE_SIZE,
    percentToReliability,
    estimatedWeeksToReach: remaining === 0 || pace == null || pace <= 0 ? null : Math.ceil(remaining / pace),
  };
}

function buildTimeToSignificance(rate: PersonalBaseRate, pace: number | null): TimeToSignificance {
  const remaining = Math.max(0, MIN_SAMPLE_SIZE - rate.predictionCount);
  const estimatedWeeks = remaining === 0 || pace == null || pace <= 0 ? null : Math.ceil(remaining / pace);
  const predictedSignificanceDate =
    estimatedWeeks == null ? null : new Date(Date.now() + estimatedWeeks * 7 * 24 * 60 * 60 * 1000);

  return {
    domain: rate.domain,
    claimType: rate.claimType,
    currentCount: rate.predictionCount,
    predictedSignificanceDate,
    message:
      remaining === 0
        ? `You already have a reliable personal base rate for ${rate.domain} ${rate.claimType} claims.`
        : predictedSignificanceDate
          ? `At your current pace, you'll have reliable personal base rates for ${rate.domain} ${rate.claimType} claims by ${predictedSignificanceDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}.`
          : `You need ${remaining} more ${rate.domain} ${rate.claimType} predictions before this base rate becomes reliable.`,
  };
}

export function buildPersonalBaseRateLibrary(userId: string, maps: ThoughtMapModel[]): PersonalBaseRateLibrary {
  const predictions = buildPredictionSamples(maps).filter((sample) => sample.userId === userId);
  const grouped = new Map<string, PredictionSample[]>();

  for (const prediction of predictions) {
    const key = `${prediction.domain}:${prediction.claimType}:${prediction.confidenceBucket}`;
    const bucket = grouped.get(key) ?? [];
    bucket.push(prediction);
    grouped.set(key, bucket);
  }

  const baseRates = Array.from(grouped.entries())
    .map(([key, samples]) => {
      const [domain, claimType, confidenceBucket] = key.split(":");
      return buildBaseRate(userId, domain ?? "general", claimType ?? "assertion", confidenceBucket ?? "0-10%", samples);
    })
    .sort((a, b) => b.predictionCount - a.predictionCount || b.empiricalRate - a.empiricalRate);

  const pace = estimatePace(predictions);
  const reliableBaseRates = baseRates.filter((rate) => rate.useInReferenceClass);
  const aggregated = new Map<string, PersonalBaseRate[]>();

  for (const rate of baseRates) {
    const key = `${rate.domain}:${rate.claimType}`;
    const bucket = aggregated.get(key) ?? [];
    bucket.push(rate);
    aggregated.set(key, bucket);
  }

  const coverageSummary = Array.from(aggregated.entries()).map(([key, rates]) => {
    const [domain, claimType] = key.split(":");
    const currentCount = rates.reduce((sum, rate) => sum + rate.predictionCount, 0);
    const pseudoRate: PersonalBaseRate = {
      ...rates[0]!,
      domain: domain ?? rates[0]!.domain,
      claimType: claimType ?? rates[0]!.claimType,
      predictionCount: currentCount,
      confirmedCount: rates.reduce((sum, rate) => sum + rate.confirmedCount, 0),
      empiricalRate: currentCount ? rates.reduce((sum, rate) => sum + rate.confirmedCount, 0) / currentCount : 0,
      isStatisticallySignificant: currentCount >= MIN_SAMPLE_SIZE,
      confidenceInterval: confidenceInterval(
        currentCount ? rates.reduce((sum, rate) => sum + rate.confirmedCount, 0) / currentCount : 0,
        currentCount,
      ),
      trend: rates.some((rate) => rate.trend === "degrading")
        ? "degrading"
        : rates.some((rate) => rate.trend === "improving")
          ? "improving"
          : rates.some((rate) => rate.trend === "stable")
            ? "stable"
            : "insufficient_data",
    };

    return buildCoverageSummary(pseudoRate, pace);
  });
  const estimatedTimeToSignificance = Array.from(aggregated.entries()).map(([key, rates]) => {
    const [domain, claimType] = key.split(":");
    const currentCount = rates.reduce((sum, rate) => sum + rate.predictionCount, 0);
    const pseudoRate: PersonalBaseRate = {
      ...rates[0]!,
      domain: domain ?? rates[0]!.domain,
      claimType: claimType ?? rates[0]!.claimType,
      predictionCount: currentCount,
      confirmedCount: rates.reduce((sum, rate) => sum + rate.confirmedCount, 0),
      empiricalRate: currentCount ? rates.reduce((sum, rate) => sum + rate.confirmedCount, 0) / currentCount : 0,
      isStatisticallySignificant: currentCount >= MIN_SAMPLE_SIZE,
      confidenceInterval: confidenceInterval(
        currentCount ? rates.reduce((sum, rate) => sum + rate.confirmedCount, 0) / currentCount : 0,
        currentCount,
      ),
      trend: rates.some((rate) => rate.trend === "degrading")
        ? "degrading"
        : rates.some((rate) => rate.trend === "improving")
          ? "improving"
          : rates.some((rate) => rate.trend === "stable")
            ? "stable"
            : "insufficient_data",
    };

    return buildTimeToSignificance(pseudoRate, pace);
  });
  const domains = Array.from(new Set(baseRates.map((rate) => rate.domain))).sort((a, b) => a.localeCompare(b));

  return {
    userId,
    domains,
    baseRates,
    reliableBaseRates,
    coverageSummary,
    estimatedTimeToSignificance,
    generatedAt: new Date(),
  };
}

export function findRelevantPersonalBaseRate(
  domain: string,
  claimType: string,
  statedConfidence: number,
  library: PersonalBaseRateLibrary,
): PersonalBaseRate | null {
  const bucket = confidenceBucketLabel(statedConfidence);

  const exactMatch = library.reliableBaseRates.find(
    (rate) => rate.domain === domain && rate.claimType === claimType && rate.confidenceBucket === bucket,
  );

  if (exactMatch) {
    return exactMatch;
  }

  const domainMatch = library.reliableBaseRates
    .filter((rate) => rate.domain === domain && rate.claimType === claimType)
    .sort((a, b) => b.predictionCount - a.predictionCount || b.empiricalRate - a.empiricalRate)[0];

  return domainMatch ?? null;
}

export function generateBaseRateWarning(personalRate: PersonalBaseRate, statedConfidence: number): string | null {
  const divergence = statedConfidence - personalRate.empiricalRate * 100;

  if (Math.abs(divergence) < 10) {
    return null;
  }

  if (divergence > 20) {
    return `⚠ Your personal base rate says that when you are ${personalRate.confidenceBucket} confident on ${personalRate.domain} ${personalRate.claimType} claims, you are right ${Math.round(personalRate.empiricalRate * 100)}% of the time, based on ${personalRate.predictionCount} predictions.`;
  }

  if (divergence < -20) {
    return `Your personal base rate suggests you may be underestimating. When you are ${personalRate.confidenceBucket} confident on ${personalRate.domain} ${personalRate.claimType} claims, you are right ${Math.round(personalRate.empiricalRate * 100)}% of the time.`;
  }

  return null;
}

export function generateCoverageMessage(domain: string, claimType: string, currentCount: number): string {
  const remaining = Math.max(0, MIN_SAMPLE_SIZE - currentCount);

  if (remaining === 0) {
    return `You have a reliable personal base rate for ${domain} ${claimType} claims.`;
  }

  return `${remaining} more ${domain} ${claimType} predictions will give you statistically reliable personal base rates in this area.`;
}
