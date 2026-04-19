import type { CalibrationDomain } from "@/types/thought-map";

export type PredictionOutcome = "correct" | "incorrect" | "partial" | "inconclusive" | "pending";

export type PredictionRecord = {
  id: string;
  userId: string;
  claimId: string;
  claimText: string;
  domain: CalibrationDomain | string;
  statedConfidence: number;
  statedAt: Date;
  resolutionDate: Date | null;
  resolvedAt: Date | null;
  outcome: PredictionOutcome;
  brierScore: number | null;
  logScore: number | null;
  calibrationContribution: number | null;
  contentHash: string;
  hashVerifiedAt: Date | null;
};

export type DomainRecord = {
  domain: CalibrationDomain | string;
  predictionCount: number;
  resolvedCount: number;
  brierScore: number | null;
  systematicError: "overconfident" | "underconfident" | "well_calibrated" | "insufficient_data";
  errorMagnitude: number;
  trend: "improving" | "stable" | "degrading";
  bestPrediction: PredictionRecord | null;
  worstPrediction: PredictionRecord | null;
};

export type BrierHistoryPoint = {
  date: Date;
  brierScore: number;
  rollingAverage: number;
  predictionCount: number;
};

export type CalibrationStreak = {
  type: "well_calibrated" | "improving" | "active_predicting";
  length: number;
  startDate: Date;
  active: boolean;
};

export type CalibrationAchievement = {
  id: string;
  type:
    | "first_prediction"
    | "first_resolution"
    | "brier_under_point2"
    | "domain_expert"
    | "consistent_calibrator"
    | "50_predictions"
    | "6_month_track_record"
    | "1_year_track_record"
    | "improved_10_points";
  label: string;
  description: string;
  earnedAt: Date;
  claimContext: string | null;
};

export type CalibrationTrackRecord = {
  userId: string;
  totalPredictions: number;
  resolvedPredictions: number;
  pendingPredictions: number;
  overallBrierScore: number | null;
  brierScorePercentile: number | null;
  domainBreakdown: DomainRecord[];
  calibrationCurve: Array<{ date: Date; confidenceBucket: string; brierScore: number; rollingAverage: number; predictionCount: number }>;
  brierScoreHistory: BrierHistoryPoint[];
  streaks: CalibrationStreak[];
  notableAchievements: CalibrationAchievement[];
  trackRecordStartDate: Date;
  trackRecordAge: number;
  lastUpdated: Date;
};

export type ShareableTrackRecord = {
  userId: string;
  displayName: string;
  trackRecordAge: string;
  totalPredictions: number;
  resolvedPredictions: number;
  overallBrierScore: number | null;
  brierPercentile: number | null;
  domainBreakdown: DomainRecord[];
  notableAchievements: CalibrationAchievement[];
  generatedAt: Date;
  signature: string;
};
