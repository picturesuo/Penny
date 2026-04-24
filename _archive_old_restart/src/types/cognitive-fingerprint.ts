export type CognitiveFingerprintPatternCategory =
  | "reasoning_style"
  | "bias"
  | "domain_tendency"
  | "emotional_pattern"
  | "update_pattern"
  | "evidence_pattern";

export type CognitiveFingerprintStatus = "emerging" | "confirmed" | "strengthening" | "weakening" | "retired";

export interface FingerprintEvidence {
  id: string;
  eventType: string;
  eventDescription: string;
  claimContext: string;
  signalStrength: number;
  timestamp: Date;
}

export interface PatternTrajectoryPoint {
  date: Date;
  strength: number;
  eventTrigger: string;
}

export interface PatternImprovementEvent {
  date: Date;
  description: string;
  evidenceType: string;
  magnitudeOfImprovement: number;
}

export interface CognitiveFingerprintEntry {
  id: string;
  userId: string;
  patternName: string;
  patternDescription: string;
  patternCategory: CognitiveFingerprintPatternCategory;
  evidenceCount: number;
  firstDetected: Date;
  lastSignal: Date;
  strongestEvidenceEvent: string;
  evidenceInstances: FingerprintEvidence[];
  status: CognitiveFingerprintStatus;
  confidenceInPattern: number;
  howItAffectsYou: string;
  howPennyResponds: string;
  trajectory: PatternTrajectoryPoint[];
  hasEverImproved: boolean;
  improvementEvents: PatternImprovementEvent[];
  userAcknowledged: boolean;
  userDisputeText: string | null;
  userFalsificationCondition: string | null;
}

export interface CognitiveFingerprint {
  userId: string;
  version: number;
  generatedAt: Date;
  totalPatternsDetected: number;
  confirmedPatterns: CognitiveFingerprintEntry[];
  emergingPatterns: CognitiveFingerprintEntry[];
  retiredPatterns: CognitiveFingerprintEntry[];
  dominantPattern: CognitiveFingerprintEntry | null;
  mostImprovedPattern: CognitiveFingerprintEntry | null;
  uniquenessScore: number;
  summaryParagraph: string;
  lensVersion: number;
}
