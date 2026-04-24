export type PersonalBaseRateTrend = "improving" | "stable" | "degrading" | "insufficient_data";

export type PersonalBaseRate = {
  id: string;
  userId: string;
  domain: string;
  claimType: string;
  confidenceBucket: string;
  predictionCount: number;
  confirmedCount: number;
  empiricalRate: number;
  isStatisticallySignificant: boolean;
  confidenceInterval: [number, number];
  lastUpdated: Date;
  trend: PersonalBaseRateTrend;
  useInReferenceClass: boolean;
};

export type CoverageSummary = {
  domain: string;
  claimType: string;
  currentCount: number;
  countNeededForReliability: number;
  percentToReliability: number;
  estimatedWeeksToReach: number | null;
};

export type TimeToSignificance = {
  domain: string;
  claimType: string;
  currentCount: number;
  predictedSignificanceDate: Date | null;
  message: string;
};

export type PersonalBaseRateLibrary = {
  userId: string;
  domains: string[];
  baseRates: PersonalBaseRate[];
  reliableBaseRates: PersonalBaseRate[];
  coverageSummary: CoverageSummary[];
  estimatedTimeToSignificance: TimeToSignificance[];
  generatedAt: Date;
};

