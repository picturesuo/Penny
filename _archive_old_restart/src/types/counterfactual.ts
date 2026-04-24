import type { ClaimResolutionType } from "@/types/thought-map";

export type CounterfactualChannel = "narrative" | "resolution_log" | "archive";

export type CounterfactualActionType = "act_on_belief" | "do_opposite" | "wait_for_more_evidence";

export type HindsightAssessment = "good_time_to_act" | "too_early" | "too_late" | "about_right" | null;

export type CounterfactualScenario = {
  id: string;
  scenarioLabel: string;
  scenarioDayOffset: number;
  confidenceAtThatPoint: number;
  actionType: CounterfactualActionType;
  hypotheticalOutcome: string;
  wasHigherConfidenceThanActual: boolean;
  wouldHaveBeenBetter: boolean | null;
  lesson: string;
};

export type DecisionTimelinePoint = {
  date: Date;
  dayOffset: number;
  confidenceAtPoint: number;
  eventAtPoint: string | null;
  hindsightAssessment: HindsightAssessment;
};

export type CounterfactualAnalysis = {
  id: string;
  claimId: string;
  userId: string;
  claimText: string;
  domain: string;
  actualOutcome: string;
  actualResolutionDate: Date;
  confidenceAtResolution: number;
  originalConfidence: number;
  resolutionType: ClaimResolutionType;
  counterfactualScenarios: CounterfactualScenario[];
  decisionTimeline: DecisionTimelinePoint[];
  keyInsight: string;
  generatedAt: Date;
};

export type CounterfactualArchiveEntry = CounterfactualAnalysis & {
  mapId: string;
  mapTitle: string;
  daysSinceResolution: number;
  resolutionLabel: string;
  timelineSummary: string;
};

export type CounterfactualArchive = {
  userId: string;
  generatedAt: Date;
  totalAnalyses: number;
  analyses: CounterfactualArchiveEntry[];
  archiveInsight: string;
};
