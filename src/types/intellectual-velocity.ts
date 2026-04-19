export type VelocityDirection = "higher_is_better" | "lower_is_better";

export type VelocityTrend = "accelerating" | "improving" | "stable" | "declining";

export type VelocityMetric = {
  id: string;
  userId: string;
  metricName: string;
  currentValue: number;
  previousValue: number;
  unit: string;
  direction: VelocityDirection;
  trend: VelocityTrend;
  trendMagnitude: number;
  computedAt: Date;
  computedOverDays: number;
  interpretation: string;
  percentile: number | null;
};

export type CompoundingSignal = {
  signalType:
    | "critique_quality_improving"
    | "fewer_stale_claims"
    | "deeper_engagement"
    | "faster_updates"
    | "broader_coverage"
    | "better_calibration"
    | "shapes_weakening";
  description: string;
  evidence: string;
  magnitude: number;
  detectedAt: Date;
};

export type IntellectualVelocityReport = {
  userId: string;
  reportDate: Date;
  periodDays: number;
  overallVelocityScore: number;
  overallTrend: VelocityTrend;
  metrics: {
    calibrationImprovement: VelocityMetric;
    engagementDepth: VelocityMetric;
    updateRate: VelocityMetric;
    blindSpotCoverage: VelocityMetric;
    critiqueSophistication: VelocityMetric;
    evidenceQualityAvg: VelocityMetric;
    beliefRevisionLatency: VelocityMetric;
    structuralHealthTrend: VelocityMetric;
  };
  mostImprovedMetric: VelocityMetric;
  needsAttentionMetric: VelocityMetric | null;
  compoundingSignals: CompoundingSignal[];
  velocityNarrative: string;
};
