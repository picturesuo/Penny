export const THOUGHT_NODE_KINDS = [
  "root",
  "core_claim",
  "why_it_matters",
  "assumption",
  "counter_argument",
  "research",
] as const;

export type ThoughtNodeKind = (typeof THOUGHT_NODE_KINDS)[number];

export const THOUGHT_NODE_STATUSES = ["active", "weak", "superseded"] as const;

export type ThoughtNodeStatus = (typeof THOUGHT_NODE_STATUSES)[number];

export const NODE_ACTIONS = [
  "expand",
  "challenge",
  "invert",
  "concretize",
  "connect",
] as const;

export type NodeAction = (typeof NODE_ACTIONS)[number];

export const CLAIM_PROVENANCES = ["intuition", "cited_source", "inherited", "derived"] as const;

export type ClaimProvenance = (typeof CLAIM_PROVENANCES)[number];

export const SOURCE_TRUST_LEVELS = ["high", "medium", "low", "self"] as const;

export type SourceTrustLevel = (typeof SOURCE_TRUST_LEVELS)[number];

export const CLAIM_STATUSES = [
  "open",
  "stress_tested",
  "resolved",
  "abandoned",
  "revisiting",
  "stale",
] as const;

export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const CLAIM_STAKES = ["reputation", "money", "time", "relationship", "self_image"] as const;

export type ClaimStake = (typeof CLAIM_STAKES)[number];

export type ClaimStructureKind = "assertion" | "conditional" | "compound" | "temporal" | "merged_candidate" | "split_candidate";

export type ThoughtMapExecutionMode =
  | "add_children"
  | "strengthen_branch"
  | "replace_weak_branch"
  | "diversify_branches";

export type ThinkingBias =
  | "confirmation_bias"
  | "shallow_abstraction"
  | "overconfidence"
  | "solution_first_thinking"
  | "option_overload";

export type CognitiveInterventionType =
  | "force_falsification"
  | "require_slots"
  | "convert_to_test"
  | "require_priority_rank"
  | "reduce_choices";

export type CognitiveInterventionStatus = "open" | "completed" | "dismissed";

export type DialecticCritiqueStrength = "mild" | "moderate" | "strong" | "adversarial";

export type DialecticResponsePath = "defend" | "revise" | "absorb";

export type ResponseClassificationType =
  | "concession"
  | "defense"
  | "dismissal"
  | "partial_concession"
  | "reframe"
  | "evidence_addition";

export type DialecticClaimElement = "main_claim" | "assumption" | "evidence" | "warrant" | "framing";

export interface ResponseClassification {
  type: ResponseClassificationType;
  confidence: number;
  classifiedBy: "user_explicit" | "inferred";
}

export interface Concession {
  id: string;
  roundId: string;
  claimElement: DialecticClaimElement;
  concededPoint: string;
  confidenceChangeTrigger: boolean;
  downstreamPropagate: boolean;
}

export interface Defense {
  id: string;
  roundId: string;
  claimElement: DialecticClaimElement | string;
  defenseText: string;
  defenseStrength: "weak" | "moderate" | "strong";
  evidenceAdded: boolean;
  newSourceCited: boolean;
}

export interface Dismissal {
  id: string;
  roundId: string;
  dismissalText: string;
  reasonGiven: string | null;
  flaggedAsAvoidance: boolean;
}

export interface DialecticRound {
  id: string;
  mapId: string;
  claimId: string | null;
  roundNumber: number;
  priorRoundId: string | null;
  critiqueGenerated: string;
  critiqueFailureTypes: string[];
  critiqueLens: string;
  critiqueStrength: DialecticCritiqueStrength;
  userResponse: string;
  responseClassification: ResponseClassification;
  concessions: Concession[];
  defenses: Defense[];
  dismissals: Dismissal[];
  confidenceAtRoundStart: number;
  confidenceAtRoundEnd: number;
  confidenceDelta: number;
  engagementScore: number;
  followUpPrompt: string | null;
  createdAt: Date;
  closedAt: Date | null;
}

export type ThoughtMapEventType =
  | "map_created"
  | "intervention_shown"
  | "intervention_completed"
  | "intervention_dismissed"
  | "bias_detected"
  | "bias_resolved"
  | "move_applied"
  | "dialectic_round"
  | "challenge_calibration"
  | "confidence_override"
  | "shape_feedback";

export type RecommendationReason =
  | "low_evidence"
  | "high_centrality"
  | "repetitive_branch"
  | "missing_counterweight"
  | "untested_assumption"
  | "weak_stakes"
  | "low_specificity"
  | "fragile_dependency";

export type InteractionMode =
  | "free_text"
  | "guided_slots"
  | "single_select"
  | "multi_select"
  | "rank_choices"
  | "forced_contrast";

export type FounderBriefRequirement = "assumption" | "counter_argument" | "research";

export interface FounderBriefReadiness {
  eligible: boolean;
  missingRequirements: FounderBriefRequirement[];
}

export interface FounderBriefModel {
  ideaSummary: string;
  targetUser: string;
  coreClaim: string;
  keyAssumptions: string[];
  strongestCounterarguments: string[];
  nextValidationSteps: string[];
  stakesLevel: "light" | "moderate" | "heavy";
  preMortem: string;
  ifYouWereRight: string;
  twinCheck: string;
  dependencyCompleteness: string;
  generatedAt: Date;
}

export interface ThoughtNodeScores {
  strength: number;
  evidence: number;
  specificity: number;
  testability: number;
  novelty: number;
  dependencyRisk: number;
  centrality: number;
  tension: number;
  coverage: number;
  confidence: number;
}

export interface NodePsychologyMeta {
  ambiguityScore: number;
  comparisonCoverageScore: number;
  falsificationCoverageScore: number;
  actionabilityScore: number;
  likelyBiases: ThinkingBias[];
}

export interface ThoughtMapRepetitiveCluster {
  clusterId: string;
  nodeIds: string[];
  label: string;
  similarityScore: number;
}

export interface ThoughtMapGraphSnapshot {
  projectId: string;
  generatedAt: string;
  totalNodes: number;
  activeNodes: number;
  weakNodes: number;
  validatedNodes: number;
  supersededNodes: number;
  branchCoverage: Record<ThoughtNodeKind, number>;
  repetitiveClusters: ThoughtMapRepetitiveCluster[];
  weakestNodeIds: string[];
  criticalDependencyIds: string[];
  missingNodeTypes: ThoughtNodeKind[];
  overallScore: number;
}

export interface BayesianPropagationStep {
  sourceNodeId: string;
  targetNodeId: string;
  depth: number;
  sourceConfidence: number;
  baseConfidence: number;
  propagatedConfidence: number;
  delta: number;
  edgeFactor: number;
  reasoning: string;
  overrideReasoning: string | null;
  pathLabel: string;
}

export interface BayesianPropagationSnapshot {
  seedNodeId: string;
  seedConfidence: number;
  overrideCount: number;
  cascade: BayesianPropagationStep[];
  supporterChain: Array<{
    nodeId: string;
    label: string;
    confidence: number | null;
  }>;
}

export interface ThoughtMapRecommendedMove {
  id: string;
  projectId: string;
  targetNodeId: string;
  action: NodeAction;
  priority: number;
  reasonCodes: RecommendationReason[];
  headline: string;
  summary: string;
  explanation: string;
  expectedOutcome: string;
  interactionMode: InteractionMode;
  targetNodeKind: ThoughtNodeKind;
  targetNodeContent: string;
  execution: {
    mode: ThoughtMapExecutionMode;
    targetNodeId: string;
    targetNodeKind: ThoughtNodeKind;
    targetParentId: string | null;
    supersededNodeId: string | null;
  };
  reasoning: {
    primaryGap: string;
    secondaryGap: string | null;
    critiqueTags: string[];
    coverage: {
      opposition: number;
      evidence: number;
      concreteness: number;
      stakes: number;
      balance: number;
    };
    why: string[];
    reasons: string[];
    weakNodes: Array<{
      nodeId: string;
      kind: ThoughtNodeKind;
      content: string;
      score: number;
      issues: string[];
    }>;
  };
  generatedAt: string;
  acceptedAt?: string | null;
  dismissedAt?: string | null;
  executedAt?: string | null;
}

export interface ThoughtMapActionResult {
  action: NodeAction;
  targetNodeId: string;
  createdNodeIds: string[];
  updatedNodeIds: string[];
  beforeScores: Partial<ThoughtNodeScores>;
  afterScores: Partial<ThoughtNodeScores>;
  summary: string;
  explanation: string;
}

export interface CognitiveIntervention {
  id: string;
  mapId: string;
  targetNodeId: string;
  type: CognitiveInterventionType;
  detector: ThinkingBias;
  triggerReason: string;
  prompt: string;
  inputMode: InteractionMode;
  status: CognitiveInterventionStatus;
  outcomeDelta: {
    ambiguityScore: number;
    comparisonCoverageScore: number;
    falsificationCoverageScore: number;
    actionabilityScore: number;
  } | null;
  createdAt: Date;
  updatedAt: Date;
  shownAt: Date;
  completedAt: Date | null;
  dismissedAt: Date | null;
}

export interface ThoughtMapEvent {
  id: string;
  mapId: string;
  nodeId: string | null;
  interventionId: string | null;
  eventType: ThoughtMapEventType;
  payload: Record<string, unknown> | null;
  createdAt: Date;
}

export interface SteelManVersion {
  versionText: string;
  savedAt: Date;
  roundContext: string | null;
}

export interface SteelMan {
  id: string;
  claimId: string;
  mapId: string;
  userId: string;
  steelManText: string;
  writtenAt: Date;
  qualityScore: number | null;
  qualityScoreReason: string | null;
  usedInRound: string[];
  updatedAt: Date | null;
  updateHistory: SteelManVersion[];
}

export interface ThoughtNodeModel {
  id: string;
  mapId: string;
  parentId: string | null;
  kind: ThoughtNodeKind;
  nodeStatus: ThoughtNodeStatus;
  actionOrigin: NodeAction | null;
  supersedesNodeId: string | null;
  content: string;
  note: string | null;
  branchOrder: number;
  scores: ThoughtNodeScores | null;
  psychology: NodePsychologyMeta | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ThoughtMapModel {
  id: string;
  userId: string;
  title: string;
  rawThought: string;
  status: string;
  nodes: ThoughtNodeModel[];
  events: ThoughtMapEvent[];
  steelMans: SteelMan[];
  founderBrief: FounderBriefModel | null;
  founderBriefReadiness: FounderBriefReadiness;
  graphSnapshot: ThoughtMapGraphSnapshot | null;
  bayesianPropagation: BayesianPropagationSnapshot | null;
  recommendedNextMove: ThoughtMapRecommendedMove | null;
  interventions: CognitiveIntervention[];
  recommendedIntervention: CognitiveIntervention | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClaimCaptureMetadata {
  confidence: number;
  resolutionDate: string | null;
  provenance: ClaimProvenance;
  provenanceDetail: string;
  sourceCitation: string;
  sourceTrustLevel: SourceTrustLevel;
  stakes: ClaimStake[];
  dependencyNotes: string;
  status: ClaimStatus;
  temporalScope?: string;
  conditionalStatement?: string;
  structureKind?: ClaimStructureKind;
}

export interface ClaimStructureSnapshot {
  whyNowTrigger: string;
  confidenceMath: string | null;
  dependencyWeight: number | null;
  directConfidence: number | null;
  propagatedConfidence: number | null;
  temporalScope: string | null;
  conditionalStatement: string | null;
  sourceCitation: string | null;
  sourceTrustLevel: SourceTrustLevel | null;
  mergeCandidates: string[];
  splitCandidates: string[];
  whyNowReason: string;
}

export interface CreateThoughtMapInput {
  rawThought: string;
  claim: ClaimCaptureMetadata;
}

export interface GeneratedThoughtNote {
  kind: ThoughtNodeKind;
  content: string;
  note?: string;
  reasoning: {
    strategy: string;
    why: string;
    anchors: string[];
  };
}

export interface GeneratedActionBundle {
  action: NodeAction;
  parentNodeId: string;
  parentNodeKind: ThoughtNodeKind;
  notes: GeneratedThoughtNote[];
  execution: {
    mode: ThoughtMapExecutionMode;
    targetNodeId: string;
    targetNodeKind: ThoughtNodeKind;
    targetParentId: string | null;
    supersededNodeId: string | null;
  };
  reasoning: {
    focus: string;
    heuristics: string[];
    sourceAnchors: string[];
    graphAnalysis?: {
      primaryGap: string;
      secondaryGap: string | null;
      critiqueTags: string[];
      coverage: {
        opposition: number;
        evidence: number;
        concreteness: number;
        stakes: number;
        balance: number;
      };
      reasons: string[];
      missingKinds: ThoughtNodeKind[];
      weakNodes: Array<{
        nodeId: string;
        kind: ThoughtNodeKind;
        content: string;
        score: number;
        issues: string[];
      }>;
      actionSelection: {
        mode: ThoughtMapExecutionMode;
        targetNodeId: string;
        targetNodeKind: ThoughtNodeKind;
        why: string[];
      };
    };
  };
  actionResult?: ThoughtMapActionResult;
  graphSnapshot?: ThoughtMapGraphSnapshot | null;
  interventions?: CognitiveIntervention[];
  recommendedIntervention?: CognitiveIntervention | null;
  recommendedNextMove?: ThoughtMapRecommendedMove | null;
}
