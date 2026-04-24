import type {
  ArtifactOutcome,
  ArtifactRecord,
  ClaimOutcomePair,
  ClaimProvenance,
  ClaimStake,
  ClaimStatus,
  ClaimStructureKind,
  Concession,
  Defense,
  DependencyHealth,
  DialecticCritiqueStrength,
  Dismissal,
  PennyUncertainty,
  ResponseClassification,
  SessionEvent,
  SessionSummary,
  SteelManVersion,
  ThoughtMapEventType,
  ThoughtMapModel,
  ThoughtNodeKind,
  ThoughtNodeStatus,
} from "@/types/thought-map";
import type { SessionState } from "@/types/penny";

export type MapStatus = ThoughtMapModel["status"];

export type Map = {
  id: string;
  userId: string;
  title: string;
  rawThought: string;
  status: MapStatus;
  claimCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ConfidenceHistoryEntry = {
  confidence: number;
  changedAt: Date;
  changedBy: "user" | "propagation";
  reason: string | null;
  roundId: string | null;
};

export type Claim = {
  id: string;
  mapId: string;
  userId: string;
  text: string;
  note: string | null;

  kind: ThoughtNodeKind;
  nodeStatus: ThoughtNodeStatus;
  structureKind: ClaimStructureKind | null;
  provenance: ClaimProvenance;
  stakes: ClaimStake[];
  status: ClaimStatus;

  confidence: number;
  confidenceHistory: ConfidenceHistoryEntry[];
  resolutionDate: Date | null;
  parentClaimId: string | null;
  dependsOn: string[];
  dialecticRoundCount: number;
  lastChallengedAt: Date | null;
  steelManId: string | null;

  createdAt: Date;
  updatedAt: Date;
};

export type SteelMan = {
  id: string;
  claimId: string;
  mapId: string;
  userId: string;
  steelManText: string;
  qualityScore: number | null;
  qualityScoreReason: string | null;
  usedInRound: string[];
  writtenAt: Date;
  updatedAt: Date | null;
  updateHistory: SteelManVersion[];
};

export type ResponseClassificationSnapshot = ResponseClassification;

export type DialecticRound = {
  id: string;
  userId: string;
  mapId: string;
  claimId: string | null;
  roundNumber: number;
  priorRoundId: string | null;

  critiqueGenerated: string;
  critiqueFailureTypes: string[];
  critiqueLens: string;
  critiqueStrength: DialecticCritiqueStrength;
  critiqueMode: string | null;
  voiceLabel: string | null;

  userResponse: string;
  responseClassification: ResponseClassificationSnapshot;
  confidenceAtRoundStart: number;
  confidenceAtRoundEnd: number;
  confidenceDelta: number;

  concessions: Concession[];
  defenses: Defense[];
  dismissals: Dismissal[];
  engagementScore: number;
  followUpPrompt: string | null;
  uncertainty: PennyUncertainty | null;

  createdAt: Date;
  closedAt: Date | null;
};

export type LearningPromptType =
  | "concept_explanation"
  | "base_rate"
  | "failure_mode"
  | "precedent"
  | "framework";

export type LearningPrompt = {
  id: string;
  claimId: string;
  roundId: string | null;
  userId: string;
  promptType: LearningPromptType;
  triggerCondition: string;
  promptText: string;
  userEngaged: boolean;
  engagedAt: Date | null;
  createdAt: Date;
};

export type ArtifactSection = {
  id: string;
  title: string;
  body: string;
  sourceClaimIds: string[];
  sectionType: string | null;
};

export type ArtifactContent = {
  sections: ArtifactSection[];
  metadata: Record<string, unknown>;
};

export type Artifact = {
  id: string;
  userId: string;
  artifactTypeId: ArtifactRecord["artifactTypeId"];
  artifactTypeName: string;
  title: string;
  audience: string | null;
  sourceMapId: string;
  generatedAt: Date;
  version: number;
  sectionOrder: string[];
  narrativeGlue: string | null;
  sections: ArtifactSection[];
  loadBearingClaims: ClaimOutcomePair[];
  dependencyHealth: DependencyHealth | null;
  outcomes: ArtifactOutcome[];
  latestOutcome: ArtifactOutcome | null;
};

export type ThinkingSession = SessionState & {
  claimsExamined: number;
  claimsUpdated: number;
  critiquesRun: number;
  sessionSummary: SessionSummary | null;
};

export type MoveType = ThoughtMapEventType | SessionEvent["eventType"] | "claim_created" | "claim_updated" | "confidence_updated" | "steel_man_written" | "learning_prompt_opened";

export type Move = {
  id: string;
  userId: string;
  mapId: string | null;
  claimId: string | null;
  sessionId: string | null;
  moveType: MoveType;
  payload: Record<string, unknown> | null;
  createdAt: Date;
};
