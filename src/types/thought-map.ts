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

export type CognitiveBiasStatus = "suspected" | "confirmed" | "monitoring" | "retired";

export type CognitiveBiasTrend = "strengthening" | "stable" | "weakening";

export type DetectionSignalType =
  | "confidence_vs_calibration"
  | "defense_rate"
  | "update_asymmetry"
  | "source_concentration"
  | "round_dismissal_rate"
  | "first_impression_stickiness";

export type DetectionSignalDirection = "confirms_bias" | "disconfirms_bias";

export interface DetectionSignal {
  signalType: DetectionSignalType;
  direction: DetectionSignalDirection;
  weight: number;
}

export interface BiasType {
  id: string;
  name: string;
  description: string;
  detectionSignals: DetectionSignal[];
  claimDomains: string[];
  mitigationPrompts: string[];
  evidenceRequiredToConfirm: number;
  evidenceRequiredToRetire: number;
}

export interface BiasEvidenceInstance {
  eventId: string;
  eventType: string;
  description: string;
  signalStrength: number;
  timestamp: Date;
}

export interface BiasEntry {
  biasType: BiasType;
  status: CognitiveBiasStatus;
  confidenceInBias: number;
  evidenceCount: number;
  evidenceInstances: BiasEvidenceInstance[];
  firstDetected: Date;
  lastSignal: Date;
  mitigationAttempts: number;
  mitigationSuccesses: number;
  claimDomains: string[];
  trend: CognitiveBiasTrend;
}

export interface CognitiveBiasProfile {
  userId: string;
  profileVersion: number;
  biasEntries: BiasEntry[];
  lastUpdated: Date;
  overallCalibrationTrend: "improving" | "stable" | "degrading";
  strongestBias: BiasType | null;
  mostImprovedBias: BiasType | null;
}

export type CognitiveInterventionType =
  | "force_falsification"
  | "require_slots"
  | "convert_to_test"
  | "require_priority_rank"
  | "reduce_choices";

export type CognitiveInterventionStatus = "open" | "completed" | "dismissed";

export type BeliefGraphPropagationModel = "bayesian" | "heuristic";

export type BeliefEdgeModel = "supportive" | "contradictory" | "conditional" | "enabling";

export type BeliefCombiningModel = "independent" | "conjunctive" | "disjunctive";

export type BeliefPropagationDecisionType = "accept" | "override" | "decouple";

export interface BeliefNode {
  claimId: string;
  kind: ThoughtNodeKind;
  prior: number;
  posterior: number;
  posteriorComputedAt: Date;
  lockedByUser: boolean;
  propagationDecoupled: boolean;
  computedFrom: string[];
}

export interface BeliefEdge {
  id: string;
  parentId: string;
  childId: string;
  conditionalProbability: number;
  edgeModel: BeliefEdgeModel;
  combiningModel: BeliefCombiningModel;
  userSetConditional: boolean;
  strength: number;
  recency: number;
}

export interface BeliefGraph {
  nodes: Map<string, BeliefNode>;
  edges: Map<string, BeliefEdge>;
  propagationModel: BeliefGraphPropagationModel;
  lastFullCompute: Date;
}

export interface BeliefPropagationContribution {
  parentId: string;
  edgeId: string;
  parentPosterior: number;
  parentPrior: number;
  edgeProbability: number;
  model: BeliefCombiningModel;
  value: number;
  explanation: string;
}

export interface BeliefPropagationStep {
  claimId: string;
  oldPosterior: number;
  newPosterior: number;
  posteriorDelta: number;
  posteriorComputedAt: Date;
  model: BeliefCombiningModel;
  edgeModel: BeliefEdgeModel;
  lockedByUser: boolean;
  propagationDecoupled: boolean;
  computedFrom: string[];
  contributions: BeliefPropagationContribution[];
  explanation: string;
  skipped?: boolean;
  skippedReason?: string | null;
}

export interface BeliefPropagationResult {
  graph: BeliefGraph;
  steps: BeliefPropagationStep[];
  changedClaimIds: string[];
  cycleError: {
    nodeIds: string[];
    message: string;
  } | null;
  computedAt: Date;
}

export interface BeliefPropagationDecision {
  id: string;
  mapId: string;
  seedClaimId: string;
  targetClaimId: string;
  decisionType: BeliefPropagationDecisionType;
  oldPosterior: number;
  proposedPosterior: number;
  finalPosterior: number;
  reason: string;
  arithmetic: {
    parentId: string;
    parentPrior: number;
    parentPosterior: number;
    edgeProbability: number;
    formula: string;
  };
  createdAt: Date;
}

export type BeliefPropagationAction = "compute" | "accept" | "override" | "decouple";

export interface BeliefPropagationRequest {
  seedClaimId: string;
  updatedPosterior: number | null;
  action: BeliefPropagationAction;
  targetClaimId: string | null;
  decisionType: BeliefPropagationDecisionType | null;
  reason: string | null;
  proposedPosterior: number | null;
  finalPosterior: number | null;
}

export interface BeliefPropagationResponse {
  result: BeliefPropagationResult;
  graphEventId: string | null;
  propagationEventId: string | null;
  decisionEventId: string | null;
  cycleError: {
    nodeIds: string[];
    message: string;
  } | null;
  graphEvent?: ThoughtMapEvent | null;
  propagationEvent?: ThoughtMapEvent | null;
  cycleEvent?: ThoughtMapEvent | null;
}

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
  | "shape_feedback"
  | "repair_action"
  | "revisit_schedule"
  | "revisit_action"
  | "belief_propagation"
  | "belief_propagation_decision"
  | "belief_graph_cycle"
  | "belief_graph_state"
  | "meta_cognition_prompt"
  | "meta_cognition_response";

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
  prior?: number;
  posterior?: number;
  contributions?: BeliefPropagationContribution[];
  skipped?: boolean;
  skippedReason?: string | null;
}

export interface BayesianPropagationSnapshot {
  seedNodeId: string;
  seedConfidence: number;
  overrideCount: number;
  cycleError?: {
    nodeIds: string[];
    message: string;
  } | null;
  cascade: BayesianPropagationStep[];
  supporterChain: Array<{
    nodeId: string;
    label: string;
    confidence: number | null;
  }>;
}

export interface BeliefPropagationGraphSnapshot {
  seedClaimId: string;
  propagationModel: BeliefGraphPropagationModel;
  computedAt: Date;
  cycleError: BeliefPropagationResult["cycleError"];
  steps: BeliefPropagationStep[];
  changedClaimIds: string[];
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

export type ShapeDerivationDirection = "confirms_shape" | "disconfirms_shape";

export interface ContributingMove {
  moveId: string;
  moveType: string;
  eventDescription: string;
  weight: number;
  direction: ShapeDerivationDirection;
  claimContext: string;
  timestamp: Date;
  includeReason: string;
}

export interface ShapeThreshold {
  requiredConfidence: number;
  actualConfidence: number;
  evidenceCountRequired: number;
  evidenceCountActual: number;
  thresholdMet: boolean;
}

export interface ShapeCounterfactual {
  description: string;
  movesToRemove: string[];
  movesNeededToNegate: string[];
  minimumChangesToRetire: number;
}

export interface ShapeDerivation {
  shapeId: string;
  derivationVersion: number;
  contributingMoves: ContributingMove[];
  derivationFormula: string;
  thresholdMet: ShapeThreshold;
  counterfactual: ShapeCounterfactual;
  alternativeShapes: string[];
  computedAt: Date;
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

export type ClaimRepairActionType =
  | "merge"
  | "split"
  | "promote"
  | "demote"
  | "reclassify"
  | "reroute_edge"
  | "reroot";

export type ClaimRepairInitiator = "user" | "penny_suggestion";

export type SupersessionType = "merge" | "split" | "reclassification";

export type EdgeChangeType = "created" | "deleted" | "rerouted" | "strength_adjusted";

export interface SupersessionRecord {
  supersededClaimIds: string[];
  supersedingClaimIds: string[];
  supersessionType: SupersessionType;
  preservedHistory: boolean;
}

export interface EdgeChange {
  edgeId: string;
  changeType: EdgeChangeType;
  fromClaimId: string;
  toClaimId: string;
  reason: string;
}

export interface ClaimRepairAction {
  id: string;
  mapId: string;
  actionType: ClaimRepairActionType;
  initiatedBy: ClaimRepairInitiator;
  sourceClaimIds: string[];
  resultingClaimIds: string[];
  reasoning: string;
  supersessionRecord: SupersessionRecord;
  edgeChanges: EdgeChange[];
  propagationTriggered: boolean;
  createdAt: Date;
}

export type RevisitPriority = "low" | "medium" | "high" | "urgent";

export type RevisitStatus = "pending" | "surfaced" | "snoozed" | "completed" | "dismissed";

export type RevisitTriggerType = "time_based" | "event_based" | "dependency_change" | "confidence_drift" | "external_trigger";

export type RevisitReasonType =
  | "age_threshold"
  | "stake_level"
  | "untested"
  | "dependency_changed"
  | "resolution_date_approaching"
  | "confidence_drift"
  | "external_trigger"
  | "manual";

export type TriggerDefinitionType = "date" | "event_keyword" | "dependency_update" | "confidence_threshold" | "manual_flag";

export type RevisitActionType =
  | "reviewed_no_change"
  | "confidence_updated"
  | "claim_updated"
  | "claim_retired"
  | "snoozed"
  | "triggered_repair"
  | "triggered_dialectic";

export type RevisitLeitnerBox = 1 | 2 | 3 | 4 | 5;

export interface TriggerDefinition {
  triggerType: TriggerDefinitionType;
  dateTarget: Date | null;
  eventKeyword: string | null;
  confidenceThreshold: number | null;
  dependencyClaimId: string | null;
}

export interface RevisitReason {
  type: RevisitReasonType;
  description: string;
  urgencyScore: number;
}

export interface RevisitAction {
  type: RevisitActionType;
  notes: string | null;
  newConfidence: number | null;
  completedAt: Date;
}

export interface RevisitSchedule {
  id: string;
  claimId: string;
  mapId: string;
  userId: string;
  scheduledFor: Date;
  schedulingReason: RevisitReason;
  priority: RevisitPriority;
  status: RevisitStatus;
  leitnerBox: RevisitLeitnerBox;
  surfacedAt: Date | null;
  userAction: RevisitAction | null;
  snoozedUntil: Date | null;
  triggerType: RevisitTriggerType;
  triggerDefinition: TriggerDefinition;
  lastComputedAt: Date;
}

export type MetaCognitionTone = "curious" | "gentle_challenge" | "observation" | "pattern_notice";

export type MetaCognitionCondition =
  | "rapid_dismissal_pattern"
  | "emotional_language"
  | "speed_pattern"
  | "confidence_stickiness"
  | "sunk_cost_signal"
  | "positive_pattern_recognition";

export interface MetaCognitionTrigger {
  id: string;
  condition: MetaCognitionCondition;
  promptTemplate: string;
  promptTone: MetaCognitionTone;
  minimumSessionLength: number;
  cooldownPeriod: number;
  biasAssociated: ThinkingBias | null;
  shapesAssociated: string[];
}

export type MetaCognitionResponseType = "that's_useful" | "disagree" | "not_now";

export interface MetaCognitionSessionContext {
  roundNumber: number;
  claimsOpen: number;
  minutesElapsed: number;
}

export interface MetaCognitionEvent {
  id: string;
  mapId: string;
  nodeId: string | null;
  triggerId: string;
  condition: MetaCognitionCondition;
  prompt: string;
  promptTone: MetaCognitionTone;
  sessionContext: MetaCognitionSessionContext;
  evidence: string[];
  responseType: MetaCognitionResponseType | null;
  responseText: string | null;
  tellMeMoreOpened: boolean;
  behaviorChangedWithinTenMinutes: boolean | null;
  createdAt: Date;
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
  shapeDerivations: ShapeDerivation[];
  steelMans: SteelMan[];
  repairActions: ClaimRepairAction[];
  revisitSchedules: RevisitSchedule[];
  founderBrief: FounderBriefModel | null;
  founderBriefReadiness: FounderBriefReadiness;
  graphSnapshot: ThoughtMapGraphSnapshot | null;
  bayesianPropagation: BayesianPropagationSnapshot | null;
  beliefGraph: BeliefGraph | null;
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
