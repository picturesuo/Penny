export type DialecticHighlightOutcome = "defended_strongly" | "conceded" | "reframed" | "dismissed";

export type BeliefShiftDirection = "increased" | "decreased" | "abandoned" | "reframed";
export type BeliefShiftTrigger = "critique_round" | "evidence_added" | "resolution" | "dependency_change" | "manual";

export interface BeliefShift {
  id: string;
  chapterId: string;
  claimId: string;
  claimText: string;
  oldConfidence: number;
  newConfidence: number;
  shiftMagnitude: number;
  shiftDirection: BeliefShiftDirection;
  shiftTrigger: BeliefShiftTrigger;
  shiftDate: Date;
  narrativeDescription: string;
  wasSignificant: boolean;
  emotionalWeight: "low" | "medium" | "high";
}

export interface DialecticHighlight {
  id: string;
  chapterId: string;
  roundId: string;
  claimText: string;
  critiqueType: string;
  userResponseSummary: string;
  outcomeType: DialecticHighlightOutcome;
  notableQuote: string;
  date: Date;
}

export interface PeriodCalibrationSummary {
  predictionsResolved: number;
  averageBrierScore: number;
  bestDomain: string;
  worstDomain: string;
  trend: "improving" | "stable" | "degrading";
}

export interface BiographyAnnotation {
  id: string;
  chapterId: string;
  userId: string;
  annotationText: string;
  targetType: "chapter" | "belief_shift" | "highlight";
  targetId: string;
  createdAt: Date;
}

export interface BiographyChapter {
  id: string;
  userId: string;
  chapterNumber: number;
  title: string;
  periodStart: Date;
  periodEnd: Date;
  dominantThemes: string[];
  majorBeliefShifts: BeliefShift[];
  significantClaims: string[];
  shapesActiveDuringPeriod: string[];
  biasesActiveDuringPeriod: string[];
  dialecticHighlights: DialecticHighlight[];
  calibrationSummary: PeriodCalibrationSummary;
  narrativeText: string;
  userAnnotations: BiographyAnnotation[];
  generatedAt: Date;
  lastRevisedAt: Date;
}

export interface IntellectualBiography {
  userId: string;
  totalChapters: number;
  chapters: BiographyChapter[];
  openingNarrative: string;
  currentNarrative: string;
  intellectualArc: string;
  totalBeliefShifts: number;
  totalDialecticRounds: number;
  totalClaimsResolved: number;
  mostRevisedBelief: string;
  longestHeldBelief: string;
  biggestSingleUpdate: BeliefShift | null;
  generatedAt: Date;
}
