import type { ThinkingMode } from "../modes.ts";

export type { MvpMode, ThinkingMode } from "../modes.ts";

export const goldenDemoSeed = "I'm building Penny, a thinking autopilot for founders." as const;

export const thinkingMoveKinds = [
  "source_recorded",
  "seed_claim_created",
  "assumptions_extracted",
  "next_move_recomputed",
  "autopilot_focus_started",
  "manual_node_selected",
  "challenge_issued",
  "user_defended",
  "claim_revised",
  "critique_absorbed",
  "focus_completed",
  "learning_triggered",
  "verify_run",
  "confidence_update_accepted",
  "confidence_update_rejected",
  "artifact_created",
] as const;

export type ThinkingMoveKind = (typeof thinkingMoveKinds)[number];

export type LegacyMoveKind =
  | "source.recorded"
  | "autopilot_suggested"
  | "challenge.response.defended"
  | "challenge.response.revised"
  | "challenge.response.absorbed";

export type IsoTimestamp = string;
export type EntityId = string;
export type Confidence = number;

export type ClaimKind = "belief" | "assumption" | "question" | "concept";
export type ClaimStatus = "exploratory" | "committed" | "resolved" | "rejected";
export type EdgeKind =
  | "depends_on"
  | "supports"
  | "questions"
  | "challenges"
  | "contradicts"
  | "clarifies"
  | "teaches";
export type EdgeStatus = "active" | "acknowledged_vulnerability";

export type FocusSource =
  | "autopilot_suggestion"
  | "autopilot_started"
  | "manual_selection"
  | "challenge_response"
  | "none";

export type NextMoveAction =
  | "resume_open_challenge"
  | "learn"
  | "clarify"
  | "verify"
  | "challenge"
  | "save_to_brain";

export type ChallengeResponseKind = "defend" | "revise" | "absorb";
export type ArtifactKind = "idea_map" | "challenge_brief" | "idea_map_challenge_brief";
export type RecipeKind = "learn" | "verify" | "check";
export type RecipeStepStatus = "pending" | "running" | "completed" | "limited" | "failed" | "skipped";

export type RecipeStepRun = {
  id: EntityId;
  recipeRunId: EntityId;
  key: string;
  title: string;
  status: RecipeStepStatus;
  position: number;
  startedAt?: IsoTimestamp;
  completedAt?: IsoTimestamp;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  error?: string;
};

export type RecipeRun = {
  id: EntityId;
  kind: RecipeKind;
  version: number;
  sessionId: EntityId;
  targetClaimId?: EntityId;
  status: RecipeStepStatus;
  title: string;
  goal: string;
  startedAt: IsoTimestamp;
  completedAt?: IsoTimestamp;
  steps: RecipeStepRun[];
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
};

export type BrainEmbeddingObjectType =
  | "brain_object"
  | "session_note"
  | "claim_version"
  | "brain_recent"
  | "artifact";

export type BrainSearchResult = {
  objectType: BrainEmbeddingObjectType;
  objectId: EntityId;
  sessionId: EntityId | null;
  title: string;
  preview: string;
  score: number;
  semanticScore: number;
  lexicalScore: number;
  source: "semantic" | "hybrid" | "lexical";
  metadata: Record<string, unknown>;
  updatedAt: IsoTimestamp;
};

export type CanvasNode = {
  id: string;
  objectId?: string;
  claimId?: string;
  type:
    | "idea"
    | "claim"
    | "assumption"
    | "question"
    | "concept"
    | "source"
    | "note"
    | "creative_direction"
    | "artifact"
    | "evidence";
  title: string;
  preview?: string;
  status?: "ephemeral" | "recent" | "saved" | "archived";
  confidence?: number;
  sourceCount?: number;
  x?: number;
  y?: number;
  metadata?: Record<string, unknown>;
};

export type CanvasEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  type:
    | "supports"
    | "depends_on"
    | "questions"
    | "challenges"
    | "contradicts"
    | "clarifies"
    | "teaches"
    | "related_to"
    | "verified_by";
  weight?: number;
  provenance?: "claim_edge" | "brain_object" | "autopilot" | "manual";
};

export type ClaimVersionSnapshot = {
  id: EntityId;
  claimId: EntityId;
  text: string;
  confidence: Confidence;
  status: ClaimStatus;
  isCurrent: boolean;
  validFrom: IsoTimestamp;
  validUntil: IsoTimestamp | null;
  supersededByVersionId: EntityId | null;
};

export type ThinkingClaim = {
  id: EntityId;
  sessionId: EntityId;
  kind: ClaimKind;
  currentVersionId: EntityId;
  text: string;
  confidence: Confidence;
  status: ClaimStatus;
  createdAt: IsoTimestamp;
  versions?: ReadonlyArray<ClaimVersionSnapshot>;
  tags?: ReadonlyArray<string>;
};

export type ThinkingEdge = {
  id: EntityId;
  sessionId: EntityId;
  fromClaimId: EntityId;
  toClaimId: EntityId;
  kind: EdgeKind;
  status: EdgeStatus;
  label: string | null;
  createdAt: IsoTimestamp;
};

export type ThinkingMove = {
  id: EntityId;
  sessionId: EntityId;
  kind: ThinkingMoveKind | LegacyMoveKind;
  summary: string;
  payload: Record<string, unknown>;
  createdAt: IsoTimestamp;
};

export type FocusState = {
  sessionId: EntityId;
  mode: ThinkingMode;
  focusedClaimId: EntityId | null;
  focusedEdgeId: EntityId | null;
  source: FocusSource;
  suggestionMoveId: EntityId | null;
  manualMoveId: EntityId | null;
  paused: boolean;
  reason: string | null;
  updatedAt: IsoTimestamp | null;
};

export type CandidateEvidence = {
  claimIds: ReadonlyArray<EntityId>;
  edgeIds: ReadonlyArray<EntityId>;
  moveIds: ReadonlyArray<EntityId>;
  artifactIds: ReadonlyArray<EntityId>;
};

export type NextMoveCandidate = {
  candidateId: EntityId;
  sessionId: EntityId;
  action: NextMoveAction;
  mode: ThinkingMode;
  targetClaimId: EntityId | null;
  targetEdgeId: EntityId | null;
  score: number;
  rank: number;
  reasonCodes: ReadonlyArray<string>;
  why: string;
  evidence: CandidateEvidence;
  blockedBy: ReadonlyArray<string>;
  wouldCreateMoveKinds: ReadonlyArray<ThinkingMoveKind>;
};

export type AutopilotTickRequest = {
  sessionId: EntityId;
  resume?: boolean;
  idempotencyKey?: string;
};

export type AutopilotTickResult = {
  status: "ready" | "paused" | "empty";
  sessionId: EntityId;
  focusState: FocusState;
  candidates: ReadonlyArray<NextMoveCandidate>;
  selectedCandidate: NextMoveCandidate | null;
  persistedMoveIds: ReadonlyArray<EntityId>;
};

export type ManualNodeSelectionCommand = {
  sessionId: EntityId;
  claimId: EntityId;
  previousSuggestionMoveId: EntityId | null;
  reason: string | null;
  idempotencyKey?: string;
};

export type ChallengeResponseCommand =
  | {
      response: "defend";
      challengeEdgeId: EntityId;
      reasoning: string;
      idempotencyKey?: string;
    }
  | {
      response: "revise";
      challengeEdgeId: EntityId;
      revisedText: string;
      reasoning: string | null;
      idempotencyKey?: string;
    }
  | {
      response: "absorb";
      challengeEdgeId: EntityId;
      reasoning: string | null;
      idempotencyKey?: string;
    };

export type ChallengeBriefArtifact = {
  id: EntityId;
  sessionId: EntityId;
  kind: "challenge_brief";
  title: string;
  claimIds: ReadonlyArray<EntityId>;
  claimVersionIds: ReadonlyArray<EntityId>;
  edgeIds: ReadonlyArray<EntityId>;
  moveIds: ReadonlyArray<EntityId>;
  createdAt: IsoTimestamp;
  sections: {
    seedSummary: string;
    claimMapSummary: string;
    loadBearingAssumptions: ReadonlyArray<string>;
    challengeOutcome: string;
    unresolvedRisks: ReadonlyArray<string>;
    recommendedNextMove: string | null;
  };
};

export type ThinkingSessionSnapshot = {
  id: EntityId;
  status: "open" | "completed";
  title: string | null;
  createdAt: IsoTimestamp;
  endedAt: IsoTimestamp | null;
};

export type ThinkingGraphSnapshot = {
  session: ThinkingSessionSnapshot;
  focusState: FocusState;
  claims: ReadonlyArray<ThinkingClaim>;
  edges: ReadonlyArray<ThinkingEdge>;
  moves: ReadonlyArray<ThinkingMove>;
  artifacts: ReadonlyArray<ChallengeBriefArtifact>;
};

export type PennyYcDemoGraphFixture = ThinkingGraphSnapshot & {
  schemaVersion: "penny-yc-demo-graph.v1";
  seed: typeof goldenDemoSeed;
  expectedAutopilot: {
    primaryCandidateId: EntityId;
    lowConfidenceMarketAssumptionId: EntityId;
    highConfidenceUnsupportedClaimId: EntityId;
    conceptClaimId: EntityId;
  };
};
