import type { ClaimStructureKind, CognitiveBiasProfile, ThoughtMapModel, ThoughtNodeModel } from "@/types/thought-map";
import type { CalibrationDashboardSnapshot, PennyLensSnapshot } from "@/lib/penny-insights";

export type CritiqueKnowledgeDepth = "surface" | "developing" | "deep" | "comprehensive";

export type DismissalPattern = {
  id: string;
  claimId: string;
  claimText: string;
  critiqueType: string | null;
  critiqueMode: string | null;
  responsePath: "defend" | "revise" | "absorb" | "unknown";
  dismissalCount: number;
  concessionCount: number;
  lastObservedAt: Date;
  summary: string;
};

export type PersonalizedCritiqueContext = {
  userId: string;
  targetClaimId: string | null;
  targetClaimType: ClaimStructureKind | null;
  targetDomain: string;
  lensVersion: number;
  confirmedBiases: string[];
  dominantShapes: string[];
  weakDomains: string[];
  strongDomains: string[];
  dismissalPatterns: DismissalPattern[];
  strongConcessionContexts: string[];
  critiqueModeAdjustment: string;
  failureTypesPrioritized: string[];
  failureTypesDeprioritized: string[];
  voiceSelected: string;
  intensityAdjustment: number;
  knowledgeAge: number;
  knowledgeDepth: CritiqueKnowledgeDepth;
  knowledgeDepthMessage: string;
  disclosure: string;
  knowsUserWellEnough: boolean;
  observedRounds: number;
  biasSignalCount: number;
  summary: string;
};

export type PersonalizedCritiqueContextInput = {
  map: ThoughtMapModel;
  targetNode: ThoughtNodeModel | null;
  biasProfile: CognitiveBiasProfile | null;
  calibration: CalibrationDashboardSnapshot;
  lens: PennyLensSnapshot | null;
};
