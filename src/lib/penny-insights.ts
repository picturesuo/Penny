import type {
  BayesianPropagationSnapshot,
  BayesianPropagationStep,
  ClaimCaptureMetadata,
  ClaimProvenance,
  ClaimStructureSnapshot,
  ClaimStructureKind,
  ClaimStatus,
  ClaimStake,
  ThoughtMapEvent,
  ThoughtMapModel,
  ThoughtNodeModel,
} from "@/types/thought-map";

export type ShapeVerdict = "confirmed" | "provisional" | "rejected" | "refined";
export type PennyShapeFeedback = "confirmed" | "rejected" | "refined";

export type PennyShapeKind = "cognitive" | "domain";

export interface PennyShape {
  id: string;
  label: string;
  summary: string;
  kind: PennyShapeKind;
  primaryMapId: string | null;
  sourceMapIds: string[];
  verdict: ShapeVerdict;
  confidence: number;
  evidenceNodeIds: string[];
  supportingNodes: ThoughtNodeModel[];
  explanation: string;
  signals: string[];
}

export interface PennyLensOverrideShape {
  id: string;
  label: string;
  verdict: PennyShapeFeedback;
  confidence: number;
  reasoning: string;
  nodeId: string | null;
  sourceMapId: string | null;
  signals: string[];
}

export interface PennyLensFreshness {
  latestMoveAt: Date | null;
  latestOverrideAt: Date | null;
  lagMinutes: number | null;
  stale: boolean;
}

export interface PennyLensComparison {
  genericShapeCount: number;
  activeShapeCount: number;
  provisionalShapeCount: number;
  overrideShapeCount: number;
  promotedShapeIds: string[];
  suppressedShapeIds: string[];
}

export interface PennyLensSnapshot {
  mapId: string;
  generatedAt: Date;
  publishConfidenceThreshold: number;
  activeConfidenceThreshold: number;
  activeShapes: PennyShape[];
  provisionalShapes: PennyShape[];
  overrideShapes: PennyLensOverrideShape[];
  effectiveShapes: PennyShape[];
  freshness: PennyLensFreshness;
  comparison: PennyLensComparison;
}

export interface BeliefGenealogy {
  current: ThoughtNodeModel | null;
  lineage: ThoughtNodeModel[];
  contradictions: ThoughtNodeModel[];
  dependents: ThoughtNodeModel[];
}

export interface ClaimDependencyEdge {
  fromNodeId: string;
  toNodeId: string;
  relation: "parent" | "supersedes";
  strengthScore: number;
  contradictionScore: number;
  recencyDays: number;
}

export interface ClaimDependencyGraph {
  nodeIds: string[];
  rootNodeIds: string[];
  loadBearingNodeIds: string[];
  edges: ClaimDependencyEdge[];
}

function confidenceFromScore(score: number | null | undefined) {
  return Math.max(0, Math.min(1, score ?? 0));
}

function recencyDaysFromDates(from: Date, to: Date) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));
}

function nodeLabel(node: ThoughtNodeModel | null | undefined) {
  if (!node) {
    return "unknown claim";
  }

  return `${node.kind.replaceAll("_", " ")}: ${node.content}`;
}

function dependencyStrengthScore(source: ThoughtNodeModel, target: ThoughtNodeModel, relation: "parent" | "supersedes") {
  const sourceConfidence = confidenceFromScore(source.scores?.confidence);
  const targetConfidence = confidenceFromScore(target.scores?.confidence);
  const sourceStrength = confidenceFromScore(source.scores?.strength);
  const targetStrength = confidenceFromScore(target.scores?.strength);
  const confidenceBlend = (sourceConfidence + targetConfidence) / 2;
  const structuralBlend = (sourceStrength + targetStrength) / 2;
  const relationBias = relation === "supersedes" ? 0.08 : 0.03;

  return Math.max(
    0,
    Math.min(100, Math.round((confidenceBlend * 0.45 + structuralBlend * 0.4 + relationBias) * 100)),
  );
}

function dependencyContradictionScore(source: ThoughtNodeModel, target: ThoughtNodeModel, relation: "parent" | "supersedes") {
  const targetFalsification = target.psychology?.falsificationCoverageScore ?? 1;
  const sourceFalsification = source.psychology?.falsificationCoverageScore ?? 1;
  const relationBias = relation === "supersedes" ? 32 : 8;
  const weakBias = target.nodeStatus === "weak" ? 10 : 0;
  const counterArgumentBias = target.kind === "counter_argument" || source.kind === "counter_argument" ? 14 : 0;

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        relationBias +
          (1 - Math.min(targetFalsification, sourceFalsification)) * 45 +
          weakBias +
          counterArgumentBias,
      ),
    ),
  );
}

function collectBayesianOverrides(events: ThoughtMapEvent[]) {
  const overrides = new Map<
    string,
    { sourceNodeId: string; targetNodeId: string; reasoning: string; mode: string }
  >();

  for (const event of events) {
    if (event.eventType !== "confidence_override") {
      continue;
    }

    const sourceNodeId = typeof event.payload?.sourceNodeId === "string" ? event.payload.sourceNodeId : null;
    const targetNodeId = typeof event.payload?.targetNodeId === "string" ? event.payload.targetNodeId : null;
    const reasoning = typeof event.payload?.reasoning === "string" ? event.payload.reasoning.trim() : "";
    const mode = typeof event.payload?.mode === "string" ? event.payload.mode.trim() : "hold";

    if (!sourceNodeId || !targetNodeId) {
      continue;
    }

    overrides.set(`${sourceNodeId}:${targetNodeId}`, {
      sourceNodeId,
      targetNodeId,
      reasoning,
      mode,
    });
  }

  return overrides;
}

export function buildBayesianPropagationSnapshot(
  map: ThoughtMapModel,
  seedNodeId: string,
): BayesianPropagationSnapshot | null {
  const seedNode = map.nodes.find((node) => node.id === seedNodeId && node.nodeStatus !== "superseded") ?? null;

  if (!seedNode) {
    return null;
  }

  const seedConfidence = confidenceFromScore(seedNode.scores?.confidence);
  const dependencyGraph = buildClaimDependencyGraph(map);
  const overrides = collectBayesianOverrides(map.events);
  const nodesById = new Map(map.nodes.map((node) => [node.id, node] as const));
  const outgoingByNode = new Map<string, string[]>();

  for (const edge of dependencyGraph.edges) {
    const outgoing = outgoingByNode.get(edge.fromNodeId) ?? [];
    outgoing.push(edge.toNodeId);
    outgoingByNode.set(edge.fromNodeId, outgoing);
  }

  const cascade: BayesianPropagationStep[] = [];
  const visited = new Set<string>([seedNode.id]);
  const queue: Array<{ nodeId: string; propagatedConfidence: number; depth: number }> = [
    { nodeId: seedNode.id, propagatedConfidence: seedConfidence, depth: 0 },
  ];

  while (queue.length) {
    const current = queue.shift();

    if (!current) {
      continue;
    }

    const children = outgoingByNode.get(current.nodeId) ?? [];

    for (const childId of children) {
      const child = nodesById.get(childId);

      if (!child || child.nodeStatus === "superseded") {
        continue;
      }

      const source = nodesById.get(current.nodeId);
      const baseConfidence = confidenceFromScore(child.scores?.confidence);
      const edge = dependencyGraph.edges.find(
        (candidate) => candidate.fromNodeId === current.nodeId && candidate.toNodeId === childId,
      );
      const strengthFactor = (edge?.strengthScore ?? 50) / 100;
      const contradictionPenalty = (edge?.contradictionScore ?? 0) / 100 * 0.28;
      const recencyPenalty = Math.min((edge?.recencyDays ?? 0) / 180, 0.12);
      const relationBias = edge?.relation === "supersedes" ? 0.06 : 0.02;
      const override = overrides.get(`${current.nodeId}:${childId}`);
      const overrideBoost = override?.mode === "hold" ? 0.08 : 0;
      const decoupled = override?.mode === "decouple";
      const edgeFactor = decoupled
        ? 1
        : Math.max(
            0.42,
            Math.min(0.98, 0.44 + strengthFactor * 0.36 + relationBias + overrideBoost - contradictionPenalty - recencyPenalty),
          );
      const propagatedConfidence = decoupled
        ? baseConfidence
        : Math.max(0, Math.min(1, (baseConfidence * 0.6 + current.propagatedConfidence * 0.4) * edgeFactor));
      const delta = propagatedConfidence - baseConfidence;

      cascade.push({
        sourceNodeId: current.nodeId,
        targetNodeId: childId,
        depth: current.depth + 1,
        sourceConfidence: current.propagatedConfidence,
        baseConfidence,
        propagatedConfidence,
        delta,
        edgeFactor,
        reasoning: override
          ? override.mode === "decouple"
            ? `You decoupled ${nodeLabel(child)} from ${nodeLabel(source)}, so the downstream claim keeps its own base confidence instead of inheriting this edge's drop.`
            : override.reasoning
          : `The confidence on ${nodeLabel(source)} carries forward into ${nodeLabel(child)} through the dependency edge.`,
        overrideReasoning: override?.reasoning || null,
        pathLabel: `${nodeLabel(source)} → ${nodeLabel(child)}`,
      });

      if (!visited.has(childId)) {
        visited.add(childId);
        queue.push({ nodeId: childId, propagatedConfidence, depth: current.depth + 1 });
      }
    }
  }

  const supporterChain = buildBeliefGenealogy(map.nodes, seedNodeId).lineage.map((node) => ({
    nodeId: node.id,
    label: nodeLabel(node),
    confidence: node.scores?.confidence ?? null,
  }));

  return {
    seedNodeId: seedNode.id,
    seedConfidence,
    overrideCount: overrides.size,
    cascade: cascade.sort((a, b) => a.depth - b.depth || b.delta - a.delta),
    supporterChain,
  };
}

export interface OldSelfSnapshot {
  id: string;
  nodeId: string;
  versionLabel: string;
  content: string;
  note: string;
  confidence: number | null;
  updatedAt: Date;
  moveLabel: string;
  moveSummary: string;
  status: ThoughtNodeModel["nodeStatus"];
  isCurrent: boolean;
}

export type MapTimelineAccent = "claim" | "stress" | "revision" | "confidence" | "shape" | "resolution";

export interface MapTimelineEntry {
  id: string;
  label: string;
  summary: string;
  createdAt: Date;
  nodeId: string | null;
  accent: MapTimelineAccent;
}

export interface MapTimelineSnapshot {
  mapId: string;
  title: string;
  entries: MapTimelineEntry[];
  summary: string;
}

export type ShapeTimelineTone = "strengthened" | "weakened" | "steady" | "feedback";

export interface ShapeTimelineStep {
  id: string;
  label: string;
  summary: string;
  createdAt: Date;
  nodeId: string | null;
  confidence: number | null;
  tone: ShapeTimelineTone;
}

export interface ShapeTimelineSnapshot {
  shapeId: string;
  label: string;
  confidence: number;
  firstSeenAt: Date | null;
  confidenceRange: {
    min: number | null;
    max: number | null;
  };
  trail: ShapeTimelineStep[];
}

export type DependencyChainTimelineRelation = "root" | "parent" | "supersedes" | "dependent";

export interface DependencyChainTimelineStep {
  id: string;
  nodeId: string | null;
  label: string;
  summary: string;
  createdAt: Date;
  relation: DependencyChainTimelineRelation;
  loadBearing: boolean;
}

export interface DependencyChainTimelineSnapshot {
  nodeId: string;
  label: string;
  steps: DependencyChainTimelineStep[];
}

export interface ClaimMoveHistoryEntry {
  id: string;
  label: string;
  summary: string;
  createdAt: Date;
  accent: "move" | "feedback" | "signal";
}

export interface PrecedentCase {
  id: string;
  name: string;
  domain: string;
  claimEquivalent: string;
  loadBearingAssumptions: string[];
  failureMode: string;
  failureTrajectory: string;
  riskTags: string[];
  killAssumption: string;
  whatKilledIt: string;
  structuralLesson: string;
  failureTypeTags: string[];
  audienceAttacks: string[];
}

export interface PrecedentSurvivorCase {
  id: string;
  name: string;
  domain: string;
  claimEquivalent: string;
  loadBearingAssumptions: string[];
  survivalTrajectory: string;
  riskTags: string[];
  whatSavedIt: string;
  structuralLesson: string;
  survivalTypeTags: string[];
}

export interface ConfidenceDecaySnapshot {
  nodeId: string;
  untouchedDays: number;
  revisitThresholdDays: number;
  decayMultiplier: number;
  decayedConfidence: number | null;
  isFoundational: boolean;
}

export interface ClaimCaptureSnapshot extends ClaimCaptureMetadata {
  mapId: string;
  title: string;
  updatedAt: Date;
}

export interface InheritedClaimSnapshot extends ClaimCaptureSnapshot {
  sourceLabel: string;
  scrutinyNote: string;
}

export interface DevilAdvocateReceipt {
  thinker: string;
  position: string;
  precedent: string;
  lesson: string;
}

export interface ContradictionCascadeStep {
  nodeId: string;
  depth: number;
  label: string;
  content: string;
  reason: string;
}

export interface ProspectiveHindsightSnapshot {
  targetNodeId: string;
  targetLabel: string;
  failurePrompt: string;
  omissionPrompt: string;
  outsideViewNote: string;
  repeatableNote: string;
}

export interface SessionRhythmSnapshot {
  depletionScore: number;
  shouldStop: boolean;
  note: string;
  signals: string[];
}

export interface ConfusionLogEntry {
  nodeId: string;
  title: string;
  confusion: string;
  nextStep: string;
  severity: number;
  ageDays: number;
  revisitPrompt: string;
}

export type CalibrationDomain = "technical" | "market" | "operational" | "research" | "people" | "general";

export interface ForecastClaimSnapshot {
  mapId: string;
  title: string;
  domain: CalibrationDomain;
  confidence: number;
  outcome: 0 | 1 | null;
  brierScore: number | null;
  status: ClaimStatus;
  resolutionDate: string | null;
  provenance: ClaimProvenance;
  stakes: ClaimStake[];
  personalCredibilityStake: "light" | "medium" | "heavy";
  evidenceSignal: number;
  bayesianShift: number;
  updatePrompt: string;
  updatedAt: Date;
}

export interface CalibrationDomainSummary {
  domain: CalibrationDomain;
  sampleSize: number;
  averageConfidence: number;
  averageOutcomeRate: number | null;
  averageBrierScore: number | null;
  calibrationGap: number | null;
  note: string;
}

export interface PrivateBetSnapshot {
  mapId: string;
  title: string;
  domain: CalibrationDomain;
  confidence: number;
  resolutionDate: string | null;
  status: ClaimStatus;
  stakes: ClaimStake[];
  credibilityLabel: string;
  prompt: string;
}

export interface BayesianUpdatePrompt {
  mapId: string;
  title: string;
  domain: CalibrationDomain;
  evidenceSignal: number;
  suggestedShift: number;
  prompt: string;
}

export interface ClaimPostMortemSnapshot {
  mapId: string;
  title: string;
  domain: CalibrationDomain;
  confidence: number;
  outcome: 0 | 1;
  brierScore: number;
  resolutionDate: string | null;
  missType: "overconfident" | "underconfident" | "well-calibrated";
  lesson: string;
  shapeSignal: string;
  reviewPrompt: string;
  updatedAt: Date;
}

export interface CalibrationDashboardSnapshot {
  resolvedClaims: ForecastClaimSnapshot[];
  domains: CalibrationDomainSummary[];
  privateBets: PrivateBetSnapshot[];
  prompts: BayesianUpdatePrompt[];
  postMortems: ClaimPostMortemSnapshot[];
}

export interface BeliefDigestSnapshot {
  mapId: string;
  title: string;
  updatedBeliefCount: number;
  updatedBeliefs: string[];
  summary: string;
  reviewPrompt: string;
  updatedAt: Date;
}

export interface PredictionRetrospectiveSnapshot {
  mapId: string;
  title: string;
  domain: CalibrationDomain;
  confidence: number;
  resolutionDate: string | null;
  brierScore: number;
  reviewPrompt: string;
  summary: string;
  updatedAt: Date;
}

export interface BeliefVelocitySnapshot {
  domain: CalibrationDomain;
  sampleSize: number;
  updateCount: number;
  averageLagDays: number | null;
  velocityLabel: "rigid" | "steady" | "volatile";
  summary: string;
}

export interface DecisionInfluenceSnapshot {
  mapId: string;
  title: string;
  summary: string;
  changedDirection: string;
  updatedAt: Date;
}

export interface MemoryTimeDashboard {
  beliefDigests: BeliefDigestSnapshot[];
  predictionRetrospectives: PredictionRetrospectiveSnapshot[];
  beliefVelocity: BeliefVelocitySnapshot[];
  decisionInfluence: DecisionInfluenceSnapshot[];
}

export interface CommunityContributionSnapshot {
  displayLabel: string;
  summary: string;
  reviewGate: string;
  sourceHint: string;
  updatedAt: Date;
}

export interface CommunityContradictionSignal {
  sourceLabel: string;
  mapCount: number;
  summary: string;
  privacyNote: string;
  updatedAt: Date;
}

export interface CommunityOpenQuestionSnapshot {
  topic: string;
  unresolvedCount: number;
  summary: string;
  researchPrompt: string;
  updatedAt: Date;
}

export interface CommunityShapeLibrarySnapshot {
  label: string;
  kind: PennyShapeKind;
  mapCount: number;
  confidence: number;
  summary: string;
}

export interface ThoughtPartnerMatchSnapshot {
  mapIds: string[];
  titles: string[];
  sharedShapes: string[];
  reason: string;
  privacyNote: string;
}

export interface CommunityCommonsDashboard {
  contributions: CommunityContributionSnapshot[];
  contradictionSignals: CommunityContradictionSignal[];
  openQuestions: CommunityOpenQuestionSnapshot[];
  shapeLibrary: CommunityShapeLibrarySnapshot[];
  thoughtPartnerMatches: ThoughtPartnerMatchSnapshot[];
}

export interface EmotionalStructureShapeSnapshot {
  stake: string;
  mapCount: number;
  summary: string;
  prompt: string;
}

export interface AssumptionArchaeologySnapshot {
  mapId: string;
  title: string;
  assumptions: string[];
  hiddenScaffold: string;
  updatedAt: Date;
}

export interface CounterShapeSnapshot {
  label: string;
  reason: string;
  counterTest: string;
  updatedAt: Date;
}

export interface ConfidenceResetSnapshot {
  mapId: string;
  title: string;
  ageDays: number;
  confidence: number;
  resetPrompt: string;
  updatedAt: Date;
}

export interface CrossProjectPatternSnapshot {
  label: string;
  mapCount: number;
  summary: string;
  handleItLikeThis: string;
}

export interface AdvancedThinkingDashboard {
  emotionalStructureShapes: EmotionalStructureShapeSnapshot[];
  confusionLog: ConfusionLogEntry[];
  assumptionArchaeology: AssumptionArchaeologySnapshot[];
  counterShapes: CounterShapeSnapshot[];
  confidenceResets: ConfidenceResetSnapshot[];
  crossProjectPatterns: CrossProjectPatternSnapshot[];
}

const SHAPE_RULES: Array<{
  id: string;
  label: string;
  kind: PennyShapeKind;
  summary: string;
  explanation: string;
  signals: string[];
  matches: (node: ThoughtNodeModel) => boolean;
}> = [
  {
    id: "market-overconfidence",
    label: "You over-confidence market claims.",
    kind: "domain",
    summary: "Market-facing claims often outrun their evidence.",
    explanation: "This shape activates when market, distribution, or adoption language shows high confidence with thin falsification.",
    signals: ["market", "distribution", "adoption", "pricing", "launch"],
    matches: (node) => {
      const text = node.content.toLowerCase();
      const psychology = node.psychology;
      const marketText = /\b(market|distribution|pricing|go[- ]to[- ]market)\b/.test(text);
      const launchContext = /\blaunch\b/.test(text) && /\b(customer|buyer|adoption|distribution|market)\b/.test(text);
      const highConfidence = (node.scores?.confidence ?? 0) >= 0.75;
      const thinEvidence = (node.scores?.evidence ?? 1) < 0.7;
      const overconfidenceBias = psychology?.likelyBiases.includes("overconfidence") === true;

      return (marketText || launchContext) && ((highConfidence && thinEvidence) || overconfidenceBias);
    },
  },
  {
    id: "market-timing-stress",
    label: "You under-stress-test market timing.",
    kind: "domain",
    summary: "Timing and demand assumptions need more explicit pressure.",
    explanation: "This shape activates when market claims appear without enough comparison or falsification coverage.",
    signals: ["timing", "market", "demand", "distribution"],
    matches: (node) => {
      const text = node.content.toLowerCase();

      return (
        /market|timing|demand|distribution|adoption/.test(text) &&
        ((node.psychology?.comparisonCoverageScore ?? 1) < 0.62 ||
          (node.psychology?.falsificationCoverageScore ?? 1) < 0.62 ||
          node.nodeStatus === "weak")
      );
    },
  },
  {
    id: "abstraction-before-concretization",
    label: "You abstract before concretizing.",
    kind: "cognitive",
    summary: "The claim stack moves to abstraction before the operational test is specific enough.",
    explanation: "This shape activates when a node is high-level but low on actionability and specificity.",
    signals: ["specificity", "concretize", "operational"],
    matches: (node) =>
      (node.scores?.specificity ?? 1) < 0.6 ||
      (node.psychology?.actionabilityScore ?? 1) < 0.58 ||
      node.psychology?.likelyBiases.includes("shallow_abstraction") === true,
  },
  {
    id: "confirmation-protection",
    label: "You protect familiar frames.",
    kind: "cognitive",
    summary: "Critique tends to preserve the original framing unless forced to falsify it.",
    explanation: "This shape activates when confirmation bias or weak falsification shows up across the map.",
    signals: ["confirmation_bias", "falsification", "frame"],
    matches: (node) =>
      node.psychology?.likelyBiases.includes("confirmation_bias") === true ||
      (node.psychology?.falsificationCoverageScore ?? 1) < 0.6,
  },
  {
    id: "choice-overload",
    label: "You widen choices before ranking them.",
    kind: "cognitive",
    summary: "Option generation appears before a strong ranking rule has been established.",
    explanation: "This shape activates when choice proliferation appears without a clear priority filter.",
    signals: ["choice", "ranking", "priority", "comparison"],
    matches: (node) =>
      node.psychology?.likelyBiases.includes("option_overload") === true ||
      (node.psychology?.comparisonCoverageScore ?? 1) < 0.58 ||
      node.scores?.tension === null,
  },
];

const PROVISIONAL_SHAPE_CONFIDENCE = 60;
const ACTIVE_SHAPE_CONFIDENCE = 76;
const LENS_FRESHNESS_STALE_MINUTES = 12 * 60;

const PRECEDENT_CORPUS: PrecedentCase[] = [
  {
    id: "quibi-mobile-shortform",
    name: "Quibi",
    domain: "consumer media",
    claimEquivalent: "Mobile premium video can create a habit users return to often enough to justify paid subscription economics.",
    loadBearingAssumptions: [
      "Users will adopt a new viewing habit fast enough to matter.",
      "Short-form premium content creates enough repeat behavior to support subscription economics.",
      "Attention scarcity helps distribution instead of merely increasing novelty.",
    ],
    failureMode: "network-effects mismatch",
    failureTrajectory: "novelty spike, weak repeat behavior, distribution never compounds",
    riskTags: ["network effects", "adoption", "distribution", "attention"],
    killAssumption: "People would pay for short-form premium video on mobile without a stronger habit loop.",
    whatKilledIt: "The product bet on a weak behavior change and a crowded attention environment, so distribution never compensated for the missing habit.",
    structuralLesson:
      "If the behavior shift is slower than the capital window, attention is not a moat; the timing of repeat use is the real constraint.",
    failureTypeTags: ["retention-collapse", "behavior-shift", "timeline-mismatch"],
    audienceAttacks: [
      "Skeptical investor: where is the durable retention loop?",
      "Thesis advisor: what theory of behavior change was actually tested?",
    ],
  },
  {
    id: "juicero-hardware-cost",
    name: "Juicero",
    domain: "hardware",
    claimEquivalent: "A premium hardware layer can justify itself by creating enough value to outrun cheaper substitutes.",
    loadBearingAssumptions: [
      "The machine creates value that cannot be replicated by a simpler workaround.",
      "Hardware complexity will be rewarded with enough willingness to pay.",
      "Supply-chain and support costs will improve rather than compound.",
    ],
    failureMode: "operational overbuild",
    failureTrajectory: "complexity expands, unit economics stay ugly, simpler workaround wins",
    riskTags: ["operations", "money", "time", "dependency"],
    killAssumption: "A premium machine would create enough value to justify expensive hardware and proprietary supply.",
    whatKilledIt: "The system optimized for complexity and capital burn, but the underlying job could be done more cheaply without the machine.",
    structuralLesson:
      "When a simpler substitute solves the same job, operational elegance is not enough; the system must win on economics, not only on engineering.",
    failureTypeTags: ["capital-intensity-compounding", "unit-economics", "operational-overbuild"],
    audienceAttacks: [
      "Skeptical investor: where is the unit-economics moat?",
      "GTM operator: what operational step is this making harder instead of easier?",
    ],
  },
  {
    id: "wework-growth",
    name: "WeWork",
    domain: "real estate / platform",
    claimEquivalent: "Community and brand can outrun the economics of occupancy and justify premium valuation.",
    loadBearingAssumptions: [
      "The story can stay ahead of the underlying cash flow.",
      "Governance weakness will not become the primary risk.",
      "Capital markets will keep rewarding the growth narrative before scrutiny catches up.",
    ],
    failureMode: "premise-rejection",
    failureTrajectory: "story outruns economics, governance weakens, premise becomes indefensible",
    riskTags: ["reputation", "money", "operational", "governance"],
    killAssumption: "Community and brand would outrun the basic economics of space and occupancy.",
    whatKilledIt: "The story outgrew the economics and governance structure, so the business became impossible to defend on its own terms.",
    structuralLesson:
      "If the premise only works while scrutiny stays low, the structure is fragile no matter how charismatic the growth story looks.",
    failureTypeTags: ["premise-rejection", "governance-drift", "capital-intensity-compounding"],
    audienceAttacks: [
      "Skeptical investor: what if the growth story is just subsidized occupancy?",
      "Thesis committee: does the premise survive once governance is removed from the slide deck?",
    ],
  },
  {
    id: "theranos-validation",
    name: "Theranos",
    domain: "health / science",
    claimEquivalent: "A hidden measurement system can carry the weight of a revolutionary promise even before independent validation exists.",
    loadBearingAssumptions: [
      "The core measurement layer is valid enough to support the surrounding claim.",
      "External validation can arrive later without changing the risk profile.",
      "Trust in the promise will survive exposure of the measurement layer.",
    ],
    failureMode: "evidence failure",
    failureTrajectory: "hidden measurement layer, validation missing, confidence outruns proof",
    riskTags: ["reputation", "relationship", "self-image", "money"],
    killAssumption: "The promise would hold even if the core measurement system could not be independently validated.",
    whatKilledIt: "The claim depended on hidden test validity, and when the measurement layer was exposed, the rest of the structure collapsed.",
    structuralLesson:
      "If the claim depends on a hidden measurement layer, validation is not a later optimization; it is the load-bearing center.",
    failureTypeTags: ["validation-gap", "measurement-failure", "evidence-failure"],
    audienceAttacks: [
      "Skeptical academic: where is the reproducible evidence chain?",
      "Thesis advisor: what specific result would falsify the core claim?",
    ],
  },
  {
    id: "google-glass-norms",
    name: "Google Glass",
    domain: "wearable computing",
    claimEquivalent: "A technically useful device can succeed even if it violates everyday social norms in public.",
    loadBearingAssumptions: [
      "Utility will outrun discomfort in public settings.",
      "Privacy concerns can be managed after adoption starts.",
      "Social norms will adjust quickly enough to support repeated use.",
    ],
    failureMode: "norm friction",
    failureTrajectory: "utility exists, but social cost becomes visible before adoption can normalize",
    riskTags: ["relationship", "self-image", "political", "social"],
    killAssumption: "The product could be useful even if it violated everyday social norms and made people uncomfortable.",
    whatKilledIt: "The social cost became visible faster than the utility, so the norm violation itself became the blocking issue.",
    structuralLesson:
      "If the norm violation is visible before the utility compounds, the product becomes a social argument before it becomes a product.",
    failureTypeTags: ["norm-friction", "privacy-risk", "adoption-friction"],
    audienceAttacks: [
      "Skeptical investor: who wants to wear this in public?",
      "Thesis committee: does the counter-case actually neutralize the social friction?",
    ],
  },
  {
    id: "clubhouse-retention",
    name: "Clubhouse",
    domain: "social audio",
    claimEquivalent: "Scarcity and novelty can bootstrap a network effect even before repeat behavior is established.",
    loadBearingAssumptions: [
      "Invite scarcity will create durable desire rather than just early attention.",
      "Novelty will convert into repeat behavior quickly enough to matter.",
      "The social graph will compound faster than novelty decays.",
    ],
    failureMode: "retention collapse",
    failureTrajectory: "attention arrives first, repeat behavior never compounds, novelty fades",
    riskTags: ["network effects", "time", "attention", "social"],
    killAssumption: "Novelty plus invite scarcity would create durable engagement and real network effects.",
    whatKilledIt: "The product got attention before it earned repeat behavior, so the network thinned once the novelty faded.",
    structuralLesson:
      "Attention can arrive before compounding behavior, but without a repeat loop the network never actually becomes a system.",
    failureTypeTags: ["retention-collapse", "behavior-shift", "network-effects-mismatch"],
    audienceAttacks: [
      "Skeptical investor: how does this keep compounding after novelty?",
      "GTM operator: what repeated behavior is the sales motion actually feeding?",
    ],
  },
];

const SURVIVOR_CORPUS: PrecedentSurvivorCase[] = [
  {
    id: "amazon-logistics-patience",
    name: "Amazon",
    domain: "commerce / logistics",
    claimEquivalent: "Capital-intensive distribution can work if the company can wait for behavior to catch up.",
    loadBearingAssumptions: [
      "The company can sustain a long runway while the market matures.",
      "Operational complexity can compound into advantage instead of only burn.",
      "Cross-subsidy and patience can bridge the adoption gap.",
    ],
    survivalTrajectory: "capital intensity endured because the timeline was long enough and the infrastructure became a moat",
    riskTags: ["capital intensity", "timeline", "logistics", "distribution"],
    whatSavedIt: "Amazon tolerated a long payoff window, used adjacent cash flows, and kept improving the infrastructure until the market caught up.",
    structuralLesson:
      "The same structure that kills a business at one horizon can survive at another if runway, cross-subsidy, and infrastructure compounding are real.",
    survivalTypeTags: ["capital-intensity-compounding", "timeline-mismatch", "distribution"],
  },
  {
    id: "netflix-format-shift",
    name: "Netflix",
    domain: "media / distribution",
    claimEquivalent: "A behavior shift can survive if the company transitions before novelty decays and keeps the user loop intact.",
    loadBearingAssumptions: [
      "The company can shift formats without losing the underlying habit.",
      "Distribution advantages carry across the transition.",
      "The new format keeps repeat behavior alive.",
    ],
    survivalTrajectory: "behavior shift succeeded because the company moved with the consumption pattern instead of waiting for it",
    riskTags: ["behavior shift", "retention", "distribution", "timing"],
    whatSavedIt: "Netflix kept the core habit while changing the delivery model, so the behavior shifted rather than breaking.",
    structuralLesson:
      "A weak behavior shift can survive when the product evolves with the user's habit instead of asking the user to form a completely new one.",
    survivalTypeTags: ["behavior-shift", "retention-collapse", "timeline-mismatch"],
  },
  {
    id: "airbnb-trust-rails",
    name: "Airbnb",
    domain: "marketplace / travel",
    claimEquivalent: "A norm-friction marketplace can survive if trust rails reduce the social cost of participation.",
    loadBearingAssumptions: [
      "Trust systems can make stranger-to-stranger exchange feel safe enough.",
      "The marketplace can keep repeated use high even when the interaction is socially unusual.",
      "Reputation and identity checks can lower the norm barrier.",
    ],
    survivalTrajectory: "norm friction persisted, but trust infrastructure and reputation systems made the experience socially workable",
    riskTags: ["trust", "norms", "marketplace", "social"],
    whatSavedIt: "Airbnb paired the unusual behavior with review systems, identity cues, and host economics that lowered the social cost.",
    structuralLesson:
      "Norm friction is survivable when the product explicitly builds rails that make the social cost legible and manageable.",
    survivalTypeTags: ["norm-friction", "adoption-friction", "trust"],
  },
  {
    id: "wikipedia-governance",
    name: "Wikipedia",
    domain: "knowledge commons",
    claimEquivalent: "A commons can survive if governance is explicit and repeated interaction is organized.",
    loadBearingAssumptions: [
      "Community rules can keep quality and trust from collapsing.",
      "Repeated interaction can be turned into governance rather than chaos.",
      "The system can absorb conflict without losing the underlying artifact.",
    ],
    survivalTrajectory: "governance risk was managed by turning conflict into process and process into repeatable moderation",
    riskTags: ["governance", "commons", "trust", "process"],
    whatSavedIt: "Wikipedia survived because the governance layer was explicit, legible, and continuously reinforced by the community itself.",
    structuralLesson:
      "When governance is the actual product layer, the system survives by making moderation and norms visible instead of pretending they do not matter.",
    survivalTypeTags: ["governance-drift", "norm-friction", "trust"],
  },
  {
    id: "salesforce-enterprise-patience",
    name: "Salesforce",
    domain: "enterprise software",
    claimEquivalent: "A long enterprise adoption cycle can survive if the product compounds trust over time.",
    loadBearingAssumptions: [
      "The market will tolerate a slower buying motion.",
      "Value can compound even while adoption is gradual.",
      "Trust and recurrence matter more than a fast one-shot conversion.",
    ],
    survivalTrajectory: "adoption took time, but the recurring model and enterprise trust made the slow path durable",
    riskTags: ["adoption", "timing", "trust", "enterprise"],
    whatSavedIt: "Salesforce survived by matching the enterprise sales cycle and letting recurrence do the compounding.",
    structuralLesson:
      "If the adoption window is long, survival depends on a structure that rewards patience rather than punishes it.",
    survivalTypeTags: ["timeline-mismatch", "adoption-friction", "trust"],
  },
];

function normalize(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ");
}

function clampConfidence(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function parseClaimCaptureMetadata(rawThought: string): ClaimCaptureMetadata | null {
  const match = rawThought.match(/## Claim capture([\s\S]*?)\n## Raw thought/);

  if (!match) {
    return null;
  }

  const metadata: Partial<ClaimCaptureMetadata> = {
    confidence: 60,
    resolutionDate: null,
    provenance: "intuition",
    provenanceDetail: "",
    sourceCitation: "",
    sourceTrustLevel: "self",
    stakes: [],
    dependencyNotes: "",
    status: "open",
    temporalScope: "",
    conditionalStatement: "",
    structureKind: "assertion",
  };

  for (const line of match[1].split("\n")) {
    const cleaned = line.trim().replace(/^- /, "");
    if (!cleaned.includes(":")) {
      continue;
    }

    const [key, ...rest] = cleaned.split(":");
    const value = rest.join(":").trim();

    switch (key.toLowerCase()) {
      case "confidence":
        metadata.confidence = Number.parseInt(value.replace("%", ""), 10);
        break;
      case "resolution date":
        metadata.resolutionDate = value === "not set" ? null : value;
        break;
      case "provenance":
        metadata.provenance = value as ClaimProvenance;
        break;
      case "provenance detail":
        metadata.provenanceDetail = value === "not specified" ? "" : value;
        break;
      case "source citation":
        metadata.sourceCitation = value === "not specified" ? "" : value;
        break;
      case "source reliability":
        metadata.sourceTrustLevel = value === "not specified" ? "self" : (value.replaceAll(" ", "_") as ClaimCaptureMetadata["sourceTrustLevel"]);
        break;
      case "stakes":
        metadata.stakes =
          value === "none tagged"
            ? []
            : value
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean) as ClaimStake[];
        break;
      case "dependency notes":
        metadata.dependencyNotes = value === "none provided" ? "" : value;
        break;
      case "status":
        metadata.status = value as ClaimStatus;
        break;
      case "temporal scope":
        metadata.temporalScope = value === "not specified" ? "" : value;
        break;
      case "conditional statement":
        metadata.conditionalStatement = value === "not specified" ? "" : value;
        break;
      case "structure kind":
        metadata.structureKind = value.replaceAll(" ", "_") as ClaimStructureKind;
        break;
      default:
        break;
    }
  }

  if (
    metadata.confidence == null ||
    metadata.resolutionDate == null ||
    metadata.provenance == null ||
    metadata.provenanceDetail == null ||
    metadata.sourceCitation == null ||
    metadata.sourceTrustLevel == null ||
    metadata.stakes == null ||
    metadata.dependencyNotes == null ||
    metadata.status == null ||
    metadata.temporalScope == null ||
    metadata.conditionalStatement == null ||
    metadata.structureKind == null
  ) {
    return null;
  }

  return metadata as ClaimCaptureMetadata;
}

export function captureSnapshotForMap(map: ThoughtMapModel): ClaimCaptureSnapshot | null {
  const capture = parseClaimCaptureMetadata(map.rawThought);

  if (!capture) {
    return null;
  }

  return {
    mapId: map.id,
    title: map.title,
    updatedAt: map.updatedAt,
    ...capture,
  };
}

function claimStructureKindForText(text: string, capture: ClaimCaptureSnapshot | null): ClaimStructureKind {
  if (capture?.structureKind) {
    return capture.structureKind;
  }

  const lower = text.toLowerCase();

  if (/if\s+.+\s+then|when\s+.+\s+then/.test(lower)) {
    return "conditional";
  }

  if (/\b(and|or|but|while|plus)\b/.test(lower) && lower.split(/\b(and|or|but|while|plus)\b/).length > 3) {
    return "compound";
  }

  if (/\b(5-year|long run|long-run|this quarter|next year|month|week|today|now|by \d{4})\b/.test(lower)) {
    return "temporal";
  }

  return "assertion";
}

function similarityScore(a: string, b: string) {
  const normalizeTokens = (value: string) =>
    Array.from(
      new Set(
        normalize(value)
          .split(/\s+/)
          .filter((token) => token.length > 2),
      ),
    );

  const aTokens = normalizeTokens(a);
  const bTokens = normalizeTokens(b);

  if (!aTokens.length || !bTokens.length) {
    return 0;
  }

  const overlap = aTokens.filter((token) => bTokens.includes(token)).length;
  return overlap / Math.max(aTokens.length, bTokens.length);
}

export function buildClaimStructureSnapshot(map: ThoughtMapModel, node: ThoughtNodeModel | null): ClaimStructureSnapshot {
  const capture = captureSnapshotForMap(map);
  const nodeText = node?.content ?? map.rawThought;
  const temporalScope = capture?.temporalScope?.trim() || null;
  const conditionalStatement = capture?.conditionalStatement?.trim() || null;
  const claimKind = claimStructureKindForText(nodeText, capture);
  const candidateNodes = map.nodes.filter((candidate) => candidate.id !== node?.id && candidate.kind !== "root");
  const mergeCandidates = candidateNodes
    .filter((candidate) => {
      const score = similarityScore(nodeText, candidate.content);
      return score >= 0.34;
    })
    .sort((a, b) => similarityScore(nodeText, b.content) - similarityScore(nodeText, a.content))
    .slice(0, 3)
    .map((candidate) => candidate.content);
  const splitCandidates = [] as string[];

  if (claimKind === "compound" || /\b(and|or|but|while|plus)\b/.test(nodeText.toLowerCase())) {
    splitCandidates.push("Split around the conjunction that carries two different claims.");
  }

  if (claimKind === "conditional" || /\bif\s+.+\s+then|when\s+.+\s+then/.test(nodeText.toLowerCase())) {
    splitCandidates.push("Keep the if-part separate from the then-part so the stress test can hit each piece.");
  }

  if (temporalScope) {
    splitCandidates.push(`Keep the ${temporalScope} horizon explicit so long-run and short-run versions do not blur together.`);
  }

  const whyNowTrigger =
    node?.nodeStatus === "weak"
      ? "This critique is appearing now because the claim is weak enough to deserve pressure."
      : node && node.parentId
        ? "This critique is appearing now because the claim sits inside an active dependency chain."
        : "This critique is appearing now because the claim is the current focus of the map.";

  const dependencyWeight = node?.scores?.dependencyRisk != null ? Number(node.scores.dependencyRisk.toFixed(2)) : null;
  const directConfidence = node?.scores?.confidence != null ? Number(node.scores.confidence.toFixed(2)) : null;
  const propagatedConfidence = node?.scores?.confidence != null ? Number(node.scores.confidence.toFixed(2)) : null;

  return {
    whyNowTrigger,
    confidenceMath: null,
    dependencyWeight,
    directConfidence,
    propagatedConfidence,
    temporalScope,
    conditionalStatement,
    sourceCitation: capture?.sourceCitation?.trim() || null,
    sourceTrustLevel: capture?.sourceTrustLevel ?? null,
    mergeCandidates,
    splitCandidates,
    whyNowReason:
      claimKind === "conditional"
        ? "Conditional claims need the if-part and then-part separated before critique can be honest."
        : claimKind === "compound"
          ? "Compound claims hide multiple commitments, so Penny surfaces a split before the critique hardens."
          : temporalScope
            ? "Temporal scope matters because the same statement can be true on one horizon and false on another."
            : "The claim is live enough that the critique should surface now rather than later.",
  };
}

export function inheritedClaimSnapshots(maps: ThoughtMapModel[]): InheritedClaimSnapshot[] {
  return maps
    .map((map) => captureSnapshotForMap(map))
    .filter((snapshot): snapshot is ClaimCaptureSnapshot => snapshot !== null && snapshot.provenance === "inherited")
    .map((snapshot) => ({
      ...snapshot,
      sourceLabel: snapshot.provenanceDetail || "Inherited from another person",
      scrutinyNote:
        snapshot.provenanceDetail.trim().length > 0
          ? `Level up scrutiny on ${snapshot.provenanceDetail}.`
          : "Level up scrutiny because the belief was inherited from someone else.",
    }))
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

function classifyCalibrationDomain(text: string): CalibrationDomain {
  if (/(market|distribution|pricing|buyer|customer acquisition|adoption|retention)/i.test(text)) {
    return "market";
  }

  if (/(ops|operation|workflow|process|handoff|execution|delivery|team|hiring)/i.test(text)) {
    return "operational";
  }

  if (/(research|evidence|study|experiment|validation|interview|test)/i.test(text)) {
    return "research";
  }

  if (/(technical|infra|engineering|architecture|system|code|api|developer)/i.test(text)) {
    return "technical";
  }

  if (/(people|relationship|leadership|culture|manager|communication|social)/i.test(text)) {
    return "people";
  }

  return "general";
}

function average(values: number[]) {
  if (!values.length) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function credibilityLabel(confidence: number, stakes: ClaimStake[]) {
  if (confidence >= 80 || stakes.length >= 3) {
    return "heavy";
  }

  if (confidence >= 65 || stakes.length >= 1) {
    return "medium";
  }

  return "light";
}

function bayesianShift(params: { confidence: number; evidenceSignal: number; outcome: 0 | 1 | null }) {
  if (params.outcome != null) {
    const actual = params.outcome * 100;
    return Math.max(-12, Math.min(12, Math.round((actual - params.confidence) / 5)));
  }

  const delta = params.evidenceSignal - params.confidence;

  if (Math.abs(delta) <= 8) {
    return 0;
  }

  return Math.max(-10, Math.min(10, Math.round(delta / 6)));
}

function missTypeForClaim(claim: ForecastClaimSnapshot): ClaimPostMortemSnapshot["missType"] {
  if (claim.outcome === 1 && claim.confidence < 55) {
    return "underconfident";
  }

  if (claim.outcome === 0 && claim.confidence >= 55) {
    return "overconfident";
  }

  return "well-calibrated";
}

function postMortemLesson(claim: ForecastClaimSnapshot, missType: ClaimPostMortemSnapshot["missType"]) {
  if (missType === "overconfident") {
    return claim.domain === "market"
      ? "The market bet was too steep for the evidence. Next time, demand one more external signal before committing."
      : "The claim outran the evidence. Next time, slow the confidence curve and force a smaller update.";
  }

  if (missType === "underconfident") {
    return claim.domain === "technical"
      ? "The technical claim was stronger than the forecast. Next time, let evidence pull confidence upward sooner."
      : "The claim was better than the score suggested. Next time, check whether hesitation is hiding a real signal.";
  }

  return "The forecast and outcome were close enough to count as a calibration win. Keep the same update rhythm.";
}

function postMortemShapeSignal(claim: ForecastClaimSnapshot, missType: ClaimPostMortemSnapshot["missType"]) {
  if (missType === "overconfident" && claim.domain === "market") {
    return "overconfident market shape";
  }

  if (missType === "overconfident") {
    return "confidence outran evidence";
  }

  if (missType === "underconfident") {
    return "evidence outran confidence";
  }

  return "calibration held";
}

function buildClaimPostMortems(resolvedClaims: ForecastClaimSnapshot[]): ClaimPostMortemSnapshot[] {
  return resolvedClaims
    .filter((claim): claim is ForecastClaimSnapshot & { outcome: 0 | 1; brierScore: number } =>
      claim.outcome != null && claim.brierScore != null,
    )
    .map((claim) => {
      const missType = missTypeForClaim(claim);

      return {
        mapId: claim.mapId,
        title: claim.title,
        domain: claim.domain,
        confidence: claim.confidence,
        outcome: claim.outcome,
        brierScore: claim.brierScore ?? 0,
        resolutionDate: claim.resolutionDate,
        missType,
        lesson: postMortemLesson(claim, missType),
        shapeSignal: postMortemShapeSignal(claim, missType),
        reviewPrompt:
          missType === "well-calibrated"
            ? "What did you do right about the confidence update, and how can you repeat that rhythm?"
            : "What cue would have changed the confidence slider by 10 points earlier?",
        updatedAt: claim.updatedAt,
      };
    })
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

const DEVILS_ADVOCATE_RECEIPTS: Array<{
  thinker: string;
  position: string;
  precedent: string;
  lesson: string;
  riskTags: string[];
}> = [
  {
    thinker: "Charlie Munger",
    position: "Invert first: incentives and obvious failure modes matter more than elegant narratives.",
    precedent: "Juicero and WeWork both show how expensive stories collapse when economics and incentives are not load-bearing.",
    lesson: "If the claim ignores incentives or unit economics, assume the failure will show up there first.",
    riskTags: ["operations", "money", "dependency"],
  },
  {
    thinker: "Daniel Kahneman",
    position: "Confidence is not accuracy, and intuition needs calibration under uncertainty.",
    precedent: "Theranos shows how strong conviction can outrun evidence until the measurement layer is exposed.",
    lesson: "When confidence is high and evidence is thin, demand a smaller update and a clearer falsifier.",
    riskTags: ["evidence", "confidence", "research"],
  },
  {
    thinker: "Clay Christensen",
    position: "Incumbents often miss low-end or adjacent disruption because the first buyers are not the obvious ones.",
    precedent: "Quibi and Clubhouse both chased attention before durable behavior changed, then stalled when novelty faded.",
    lesson: "If the user side of the bet is too easy to admire and too hard to sustain, ask what repeats after novelty.",
    riskTags: ["adoption", "network effects", "market"],
  },
  {
    thinker: "Elinor Ostrom",
    position: "Commons can work, but only when governance, local rules, and repeated interaction are designed deliberately.",
    precedent: "Google Glass shows what happens when a technically neat idea collides with social norm friction.",
    lesson: "If the norm layer is load-bearing, a pure product argument is not enough.",
    riskTags: ["norm", "social", "political"],
  },
];

export function buildDevilsAdvocateReceipts(node: ThoughtNodeModel | null): DevilAdvocateReceipt[] {
  if (!node) {
    return [];
  }

  const text = node.content.toLowerCase();
  const tags = new Set(riskProfile(node));

  return DEVILS_ADVOCATE_RECEIPTS.map((receipt) => {
    let score = 0;

    if (receipt.riskTags.some((tag) => tags.has(tag))) score += 3;
    if (receipt.thinker === "Daniel Kahneman" && (node.scores?.confidence ?? 0) > 0.7) score += 2;
    if (receipt.thinker === "Clay Christensen" && /market|adoption|distribution|retention/.test(text)) score += 2;
    if (receipt.thinker === "Elinor Ostrom" && tags.has("norm")) score += 2;
    if (receipt.thinker === "Charlie Munger" && (tags.has("operations") || tags.has("dependency"))) score += 2;

    void score;
    return { ...receipt, score };
  })
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((receipt) => {
      const { score, ...rest } = receipt;
      void score;
      return rest;
    });
}

function shapeVerdict(confidence: number, supportCount: number): ShapeVerdict {
  if (confidence >= 76 && supportCount >= 2) {
    return "confirmed";
  }

  if (confidence >= 60) {
    return "provisional";
  }

  if (confidence <= 45) {
    return "rejected";
  }

  return "refined";
}

function moveLabelForNode(node: ThoughtNodeModel, event?: ThoughtMapEvent | undefined) {
  if (event?.eventType === "move_applied" && typeof event.payload?.action === "string") {
    return `${String(event.payload.action).replaceAll("_", " ")} move`;
  }

  if (node.actionOrigin) {
    return `${node.actionOrigin.replaceAll("_", " ")} move`;
  }

  return node.kind === "root" ? "capture" : "self-iteration";
}

function riskProfile(node: ThoughtNodeModel) {
  const text = normalize(node.content);
  const tags = new Set<string>();

  if (node.scores?.dependencyRisk != null && node.scores.dependencyRisk > 0.55) {
    tags.add("dependency");
  }
  if (node.scores?.coverage != null && node.scores.coverage < 0.55) {
    tags.add("network effects");
  }
  if ((node.psychology?.comparisonCoverageScore ?? 1) < 0.6) {
    tags.add("comparison");
  }
  if ((node.psychology?.falsificationCoverageScore ?? 1) < 0.6) {
    tags.add("evidence");
  }
  if (node.scores?.confidence != null && node.scores.confidence > 0.7) {
    tags.add("confidence");
  }
  if (text.includes("norm") || text.includes("policy") || text.includes("social")) {
    tags.add("norm");
  }
  if (text.includes("team") || text.includes("process") || text.includes("workflow")) {
    tags.add("operations");
  }
  if (text.includes("market") || text.includes("distribution") || text.includes("buyer")) {
    tags.add("adoption");
  }

  return Array.from(tags);
}

function structuralPatternSignals(node: ThoughtNodeModel) {
  const text = normalize(node.content);
  const signals = new Set<string>();

  if (/(growth|scale|burn|cash|runway|capital|unit economics|logistics|warehouse)/.test(text)) {
    signals.add("capital-intensity-compounding");
    signals.add("timeline-mismatch");
  }

  if (/(repeat|retention|habit|novelty|engagement|repeat behavior|compounds)/.test(text)) {
    signals.add("retention-collapse");
    signals.add("behavior-shift");
  }

  if (/(validation|measure|measurement|proof|evidence|falsif|test)/.test(text)) {
    signals.add("validation-gap");
    signals.add("measurement-failure");
  }

  if (/(norm|social cost|public|privacy|awkward|wear|trust|identity)/.test(text)) {
    signals.add("norm-friction");
    signals.add("trust");
  }

  if (/(governance|board|control|moderation|policy|commons|process)/.test(text)) {
    signals.add("governance-drift");
  }

  if (/(network|distribution|adoption|marketplace|platform)/.test(text)) {
    signals.add("network-effects-mismatch");
    signals.add("adoption-friction");
  }

  return signals;
}

export function retrievePrecedentsForNode(
  node: ThoughtNodeModel,
  limitOrLens: number | PennyLensSnapshot = 3,
  maybeLens?: PennyLensSnapshot | null,
): PrecedentCase[] {
  const limit = typeof limitOrLens === "number" ? limitOrLens : 3;
  const lens = typeof limitOrLens === "number" ? maybeLens ?? null : limitOrLens;
  const tags = new Set(riskProfile(node));
  const text = normalize(node.content);
  const structuralSignals = structuralPatternSignals(node);
  const lensSignals = new Set(
    lens
      ? [
          ...lens.activeShapes.flatMap((shape) => shape.signals),
          ...lens.provisionalShapes.flatMap((shape) => shape.signals),
          ...lens.overrideShapes.flatMap((shape) => shape.signals),
        ]
      : [],
  );
  const lensLabels = new Set(
    lens
      ? [
          ...lens.activeShapes.map((shape) => normalize(shape.label)),
          ...lens.provisionalShapes.map((shape) => normalize(shape.label)),
          ...lens.overrideShapes.map((shape) => normalize(shape.label)),
        ]
      : [],
  );

  return [...PRECEDENT_CORPUS]
    .map((precedent) => {
      let score = 0;

      if (precedent.riskTags.some((tag) => tags.has(tag))) score += 3;
      if (precedent.failureTrajectory && /compound|repeat|retention|habit|distribution/.test(text) && /repeat|retention|habit|compounds/.test(precedent.failureTrajectory)) score += 3;
      if (precedent.failureTrajectory && /economics|unit economics|burn|cost/.test(text) && /economics|cost|unit economics|complexity/.test(precedent.failureTrajectory)) score += 3;
      if (precedent.failureTrajectory && /validation|measure|evidence|proof/.test(text) && /validation|measure|proof|measurement/.test(precedent.failureTrajectory)) score += 3;
      if (precedent.failureTrajectory && /norm|social|public|wear|social cost/.test(text) && /social cost|norm/.test(precedent.failureTrajectory)) score += 3;
      if (precedent.failureTypeTags.some((tag) => structuralSignals.has(tag))) score += 4;
      if (precedent.failureMode.includes("evidence") && (node.psychology?.falsificationCoverageScore ?? 1) < 0.6) score += 2;
      if (precedent.failureMode.includes("network") && tags.has("network effects")) score += 2;
      if (precedent.failureMode.includes("norm") && tags.has("norm")) score += 2;
      if (precedent.failureMode.includes("operational") && tags.has("operations")) score += 2;
      if (precedent.failureMode.includes("premise") && (node.scores?.confidence ?? 0) > 0.7) score += 1;
      if (
        lensSignals.size > 0 &&
        precedent.riskTags.some((tag) => lensSignals.has(tag) || lensLabels.has(normalize(tag)))
      ) {
        score += 2;
      }
      if (precedent.name.toLowerCase().includes("wework") && text.includes("governance")) score += 1;
      if (precedent.name.toLowerCase().includes("theranos") && text.includes("validation")) score += 1;

      return { precedent, score };
    })
    .sort((a, b) => b.score - a.score)
    .filter((item) => item.score > 0)
    .slice(0, limit)
    .map(({ precedent }) => precedent);
}

export function retrieveSurvivorPrecedentsForNode(
  node: ThoughtNodeModel,
  limitOrLens: number | PennyLensSnapshot = 3,
  maybeLens?: PennyLensSnapshot | null,
): PrecedentSurvivorCase[] {
  const limit = typeof limitOrLens === "number" ? limitOrLens : 3;
  const lens = typeof limitOrLens === "number" ? maybeLens ?? null : limitOrLens;
  const tags = new Set(riskProfile(node));
  const text = normalize(node.content);
  const structuralSignals = structuralPatternSignals(node);
  const lensSignals = new Set(
    lens
      ? [
          ...lens.activeShapes.flatMap((shape) => shape.signals),
          ...lens.provisionalShapes.flatMap((shape) => shape.signals),
          ...lens.overrideShapes.flatMap((shape) => shape.signals),
        ]
      : [],
  );
  const lensLabels = new Set(
    lens
      ? [
          ...lens.activeShapes.map((shape) => normalize(shape.label)),
          ...lens.provisionalShapes.map((shape) => normalize(shape.label)),
          ...lens.overrideShapes.map((shape) => normalize(shape.label)),
        ]
      : [],
  );

  return [...SURVIVOR_CORPUS]
    .map((survivor) => {
      let score = 0;

      if (survivor.riskTags.some((tag) => tags.has(tag) || structuralSignals.has(tag))) score += 3;
      if (survivor.survivalTypeTags.some((tag) => structuralSignals.has(tag))) score += 4;
      if (survivor.survivalTrajectory && /timeline|patience|runway|repeat|trust|governance/.test(text) && /timeline|patience|repeat|trust|governance/.test(survivor.survivalTrajectory)) score += 2;
      if (lensSignals.size > 0 && survivor.riskTags.some((tag) => lensSignals.has(tag) || lensLabels.has(normalize(tag)))) {
        score += 2;
      }

      return { survivor, score };
    })
    .sort((a, b) => b.score - a.score)
    .filter((item) => item.score > 0)
    .slice(0, limit)
    .map(({ survivor }) => survivor);
}

export function retrieveSurvivorPrecedentsForCase(
  precedent: PrecedentCase,
  limit = 3,
): PrecedentSurvivorCase[] {
  const precedentSignals = new Set(precedent.failureTypeTags);
  const precedentText = normalize(
    [precedent.claimEquivalent, precedent.failureTrajectory, precedent.whatKilledIt, precedent.structuralLesson].join(" "),
  );

  return [...SURVIVOR_CORPUS]
    .map((survivor) => {
      let score = 0;

      if (survivor.survivalTypeTags.some((tag) => precedentSignals.has(tag))) score += 4;
      if (survivor.riskTags.some((tag) => precedent.riskTags.includes(tag))) score += 2;
      if (survivor.survivalTrajectory && /timeline|patience|runway|repeat|trust|governance/.test(precedentText) && /timeline|patience|repeat|trust|governance/.test(survivor.survivalTrajectory)) score += 2;
      if (survivor.whatSavedIt && /saved|wait|trust|patience|infrastructure|reputation|governance/.test(normalize(survivor.whatSavedIt))) score += 1;

      return { survivor, score };
    })
    .sort((a, b) => b.score - a.score)
    .filter((item) => item.score > 0)
    .slice(0, limit)
    .map(({ survivor }) => survivor);
}

export interface AdversarialFinalPassSnapshot {
  claimCount: number;
  loadBearingAssumption: ThoughtNodeModel | null;
  quietKeystoneIndex: number | null;
  quietKeystoneReason: string;
  collapseWarning: string;
  dependentCount: number;
  loadBearingCount: number;
  keystoneScore: number | null;
  runnerUpScore: number | null;
  scoreGap: number | null;
  isQuietKeystone: boolean;
}

export function buildAdversarialFinalPass(map: ThoughtMapModel): AdversarialFinalPassSnapshot {
  const activeNodes = map.nodes.filter((node) => node.nodeStatus !== "superseded");
  const dependencyGraph = buildClaimDependencyGraph(map);
  const loadBearingCandidates = dependencyGraph.loadBearingNodeIds
    .map((nodeId) => map.nodes.find((node) => node.id === nodeId) ?? null)
    .filter((node): node is ThoughtNodeModel => node != null);
  const scoreForNode = (node: ThoughtNodeModel) =>
    (node.scores?.dependencyRisk ?? 0) + (node.scores?.centrality ?? 0) + (node.parentId ? 0.1 : 0);
  const scoredLoadBearing = [...loadBearingCandidates].sort((a, b) => scoreForNode(b) - scoreForNode(a));
  const loadBearingAssumption = scoredLoadBearing[0] ?? null;
  const keystoneScore = loadBearingAssumption
    ? scoreForNode(loadBearingAssumption)
    : null;
  const runnerUpScore = scoredLoadBearing[1] ? scoreForNode(scoredLoadBearing[1]) : null;
  const quietKeystoneIndex = loadBearingAssumption ? activeNodes.findIndex((node) => node.id === loadBearingAssumption.id) + 1 : null;
  const dependentCount = loadBearingAssumption
    ? activeNodes.filter(
        (node) => node.parentId === loadBearingAssumption.id || node.supersedesNodeId === loadBearingAssumption.id,
      ).length
    : 0;
  const scoreGap = keystoneScore != null && runnerUpScore != null ? keystoneScore - runnerUpScore : null;
  const scorePercentile = keystoneScore == null
    ? null
    : (() => {
        const activeScores = activeNodes
          .map(scoreForNode)
          .sort((a, b) => b - a);
        if (activeScores.length <= 1) {
          return 100;
        }
        const betterCount = activeScores.filter((score) => score > keystoneScore).length;
        return Math.max(0, 100 - (betterCount / Math.max(1, activeScores.length - 1)) * 100);
      })();
  const isQuietKeystone =
    loadBearingAssumption != null &&
    scorePercentile != null &&
    scorePercentile >= 95 &&
    ((scoreGap != null && scoreGap >= 0.12) || dependentCount >= 5);

  return {
    claimCount: activeNodes.length,
    loadBearingAssumption,
    quietKeystoneIndex,
    quietKeystoneReason: loadBearingAssumption
      ? isQuietKeystone
        ? `Penny found a rare quiet keystone by prioritizing central, dependency-heavy claims instead of the loudest branch.`
        : `Penny found a candidate keystone, but it is not yet rare enough to treat as the dramatic collapse point.`
      : "Penny could not isolate a single keystone yet.",
    collapseWarning: loadBearingAssumption
      ? isQuietKeystone
        ? `If #${quietKeystoneIndex ?? "?"} fails, the entire argument collapses.`
        : `This claim is structurally important, but Penny is waiting for a clearer keystone signal before treating it as the whole-map failure point.`
      : "The dependency structure is not yet rich enough for a confident collapse warning.",
    dependentCount,
    loadBearingCount: loadBearingCandidates.length,
    keystoneScore,
    runnerUpScore,
    scoreGap,
    isQuietKeystone,
  };
}

export function buildProspectiveHindsightSnapshot(node: ThoughtNodeModel | null): ProspectiveHindsightSnapshot | null {
  if (!node) {
    return null;
  }

  const targetLabel = node.content;

  return {
    targetNodeId: node.id,
    targetLabel,
    failurePrompt: `Imagine this claim has been definitively disproven six months from now. What was the story?`,
    omissionPrompt: `Imagine you didn't pursue this and it turned out to be right. What did you miss?`,
    outsideViewNote:
      "Prospective hindsight pushes the claim into an outside-view frame so the risk story is less inside-story and more objective.",
    repeatableNote: "This mode is available on any claim at any time, not just at synthesis.",
  };
}

export function buildConfidenceDecaySnapshot(node: ThoughtNodeModel, dependentsCount = 0): ConfidenceDecaySnapshot {
  const untouchedDays = Math.max(0, Math.floor((Date.now() - node.updatedAt.getTime()) / (1000 * 60 * 60 * 24)));
  const isFoundational = node.kind === "root" || node.kind === "core_claim" || node.kind === "why_it_matters";
  const foundationPressure = Math.min(6, Math.floor(dependentsCount / 2));
  const revisitThresholdDays = isFoundational ? Math.max(4, 9 - foundationPressure) : Math.max(10, 21 - Math.floor(dependentsCount / 3));
  const decayMultiplier =
    untouchedDays <= revisitThresholdDays
      ? 1
      : Math.max(0.35, 1 - (untouchedDays - revisitThresholdDays) * (isFoundational ? 0.08 : 0.03));
  const confidence = node.scores?.confidence ?? null;

  return {
    nodeId: node.id,
    untouchedDays,
    revisitThresholdDays,
    decayMultiplier,
    decayedConfidence: confidence == null ? null : Math.max(0, Math.round(confidence * decayMultiplier * 100) / 100),
    isFoundational,
  };
}

export function traceContradictionCascade(nodes: ThoughtNodeModel[], nodeId: string): ContradictionCascadeStep[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const root = byId.get(nodeId);

  if (!root) {
    return [];
  }

  const visited = new Set<string>();
  const queue: Array<{ node: ThoughtNodeModel; depth: number }> = [{ node: root, depth: 0 }];
  const steps: ContradictionCascadeStep[] = [];

  while (queue.length) {
    const current = queue.shift();
    if (!current || visited.has(current.node.id)) {
      continue;
    }

    visited.add(current.node.id);
    const label = current.depth === 0 ? "foundation changed" : current.node.kind.replaceAll("_", " ");
    const reason =
      current.depth === 0
        ? "This is the claim whose change can cascade through the map."
        : current.node.supersedesNodeId === nodeId
          ? "This branch directly replaces the foundation."
          : current.node.parentId === nodeId
            ? "This branch depends directly on the foundation."
            : "This branch is downstream and should be revisited.";

    steps.push({
      nodeId: current.node.id,
      depth: current.depth,
      label,
      content: current.node.content,
      reason,
    });

    const dependents = nodes.filter(
      (candidate) =>
        candidate.parentId === current.node.id ||
        candidate.supersedesNodeId === current.node.id ||
        candidate.parentId === root.id && current.depth === 0,
    );

    for (const dependent of dependents) {
      if (!visited.has(dependent.id)) {
        queue.push({ node: dependent, depth: current.depth + 1 });
      }
    }
  }

  return steps.slice(0, 10);
}

export function buildSessionRhythmSnapshot(map: ThoughtMapModel): SessionRhythmSnapshot {
  const activeNodes = map.nodes.filter((node) => node.nodeStatus !== "superseded");
  const unresolved = [
    ...(map.graphSnapshot?.weakestNodeIds ?? []),
    ...(map.graphSnapshot?.criticalDependencyIds ?? []),
    ...map.founderBriefReadiness.missingRequirements,
  ];
  const weakNodes = activeNodes.filter(
    (node) =>
      (node.scores?.evidence ?? 1) < 0.55 ||
      (node.scores?.dependencyRisk ?? 0) > 0.55 ||
      (node.psychology?.falsificationCoverageScore ?? 1) < 0.55,
  );
  const depletionScore = Math.min(100, unresolved.length * 12 + weakNodes.length * 9 + Math.max(0, activeNodes.length - 10) * 2);
  const shouldStop = depletionScore >= 68;

  return {
    depletionScore,
    shouldStop,
    note: shouldStop
      ? "You are likely past the useful edge. Stop, capture the artifact, and come back with a fresher lens."
      : "You still have room to press the map, but keep the session short if the load-bearing branches keep piling up.",
    signals: [
      `${unresolved.length} unresolved gaps`,
      `${weakNodes.length} weak or fragile nodes`,
      `${activeNodes.length} active nodes`,
    ],
  };
}

export function interleaveStressNodes(nodes: ThoughtNodeModel[]): ThoughtNodeModel[] {
  const buckets = [
    nodes.filter((node) => (node.scores?.evidence ?? 1) < 0.6),
    nodes.filter((node) => (node.psychology?.falsificationCoverageScore ?? 1) < 0.6),
    nodes.filter((node) => (node.scores?.dependencyRisk ?? 0) > 0.55),
    nodes.filter((node) => (node.psychology?.comparisonCoverageScore ?? 1) < 0.6),
  ].map((bucket) => [...bucket]);

  const interleaved: ThoughtNodeModel[] = [];
  let added = true;

  while (added) {
    added = false;

    for (const bucket of buckets) {
      const next = bucket.shift();
      if (next) {
        interleaved.push(next);
        added = true;
      }
    }
  }

  return interleaved;
}

function buildPennyShapeCandidates(nodes: ThoughtNodeModel[]): PennyShape[] {
  return SHAPE_RULES.reduce<PennyShape[]>((acc, rule) => {
    const supportingNodes = nodes.filter(rule.matches);

    if (!supportingNodes.length) {
      return acc;
    }

    const supportCount = supportingNodes.length;
    const confidence = clampConfidence(40 + supportCount * 14 + Math.min(12, supportCount * 2));

    acc.push({
      id: rule.id,
      label: rule.label,
      summary: rule.summary,
      kind: rule.kind,
      primaryMapId: supportingNodes[0]?.mapId ?? null,
      sourceMapIds: Array.from(new Set(supportingNodes.map((node) => node.mapId))),
      verdict: shapeVerdict(confidence, supportCount),
      confidence,
      evidenceNodeIds: supportingNodes.map((node) => node.id),
      supportingNodes: supportingNodes.slice(0, 4),
      explanation: rule.explanation,
      signals: rule.signals,
    });

    return acc;
  }, []);
}

function buildOverrideShapeLayer(map: ThoughtMapModel): PennyLensOverrideShape[] {
  const latestByShapeId = new Map<string, PennyLensOverrideShape>();

  for (const event of map.events) {
    if (event.eventType !== "shape_feedback") {
      continue;
    }

    const shapeId = typeof event.payload?.shapeId === "string" ? String(event.payload.shapeId) : null;
    const verdict = event.payload?.verdict;
    const shapeLabel = typeof event.payload?.shapeLabel === "string" ? String(event.payload.shapeLabel).trim() : "";
    const reasoning = typeof event.payload?.reasoning === "string" ? String(event.payload.reasoning).trim() : "";
    const nodeId = typeof event.payload?.nodeId === "string" ? String(event.payload.nodeId) : null;

    if (!shapeId || (verdict !== "confirmed" && verdict !== "rejected" && verdict !== "refined")) {
      continue;
    }

    const overrideShape: PennyLensOverrideShape = {
      id: shapeId,
      label: shapeLabel || shapeId,
      verdict,
      confidence: verdict === "confirmed" ? 92 : verdict === "refined" ? 74 : 38,
      reasoning: reasoning || "The shape was explicitly overridden.",
      nodeId,
      sourceMapId: map.id,
      signals: Array.from(
        new Set(
          `${shapeLabel} ${reasoning}`
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, " ")
            .split(/\s+/)
            .filter((token) => token.length >= 4),
        ),
      ).slice(0, 6),
    };

    const existing = latestByShapeId.get(shapeId);

    if (!existing || existing.confidence <= overrideShape.confidence) {
      latestByShapeId.set(shapeId, overrideShape);
    }
  }

  return Array.from(latestByShapeId.values()).sort((a, b) => b.confidence - a.confidence);
}

function adjustLensShapes(shapes: PennyShape[], overrideShapes: PennyLensOverrideShape[]) {
  const overrideById = new Map(overrideShapes.map((shape) => [shape.id, shape] as const));
  const promotedShapeIds: string[] = [];
  const suppressedShapeIds: string[] = [];

  const adjusted = shapes.reduce<PennyShape[]>((acc, shape) => {
    const override = overrideById.get(shape.id);

    if (override?.verdict === "rejected") {
      suppressedShapeIds.push(shape.id);
      return acc;
    }

    if (override) {
      promotedShapeIds.push(shape.id);
      const lift = override.verdict === "confirmed" ? 12 : 6;
      acc.push({
        ...shape,
        confidence: clampConfidence(shape.confidence + lift),
        verdict: override.verdict === "confirmed" ? "confirmed" : override.verdict === "refined" ? "refined" : shape.verdict,
        explanation: `${shape.explanation} Override reasoning: ${override.reasoning}`,
      });
      return acc;
    }

    acc.push(shape);
    return acc;
  }, []);

  for (const override of overrideShapes) {
    if (!shapes.some((shape) => shape.id === override.id) && override.verdict !== "rejected") {
      promotedShapeIds.push(override.id);
      adjusted.push({
        id: override.id,
        label: override.label,
        summary: override.reasoning,
        kind: "domain",
        primaryMapId: override.sourceMapId,
        sourceMapIds: override.sourceMapId ? [override.sourceMapId] : [],
        verdict: override.verdict === "confirmed" ? "confirmed" : override.verdict === "refined" ? "refined" : "provisional",
        confidence: override.confidence,
        evidenceNodeIds: override.nodeId ? [override.nodeId] : [],
        supportingNodes: [],
        explanation: override.reasoning,
        signals: override.signals,
      });
    }
  }

  const activeShapes = adjusted.filter((shape) => shape.confidence >= ACTIVE_SHAPE_CONFIDENCE);
  const provisionalShapes = adjusted.filter(
    (shape) => shape.confidence >= PROVISIONAL_SHAPE_CONFIDENCE && shape.confidence < ACTIVE_SHAPE_CONFIDENCE,
  );

  return {
    activeShapes,
    provisionalShapes,
    effectiveShapes: [...activeShapes, ...provisionalShapes],
    promotedShapeIds,
    suppressedShapeIds,
  };
}

export function buildPennyLens(map: ThoughtMapModel): PennyLensSnapshot {
  const shapeCandidates = buildPennyShapeCandidates(map.nodes);
  const overrideShapes = buildOverrideShapeLayer(map);
  const adjusted = adjustLensShapes(shapeCandidates, overrideShapes);
  const latestMoveAt =
    map.events
      .filter((event) => event.eventType === "move_applied")
      .map((event) => event.createdAt)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const latestOverrideAt =
    map.events
      .filter((event) => event.eventType === "shape_feedback")
      .map((event) => event.createdAt)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const lagReferenceAt =
    latestMoveAt == null
      ? null
      : latestOverrideAt && latestOverrideAt.getTime() > latestMoveAt.getTime()
        ? latestOverrideAt
        : new Date();
  const lagMinutes =
    latestMoveAt == null || lagReferenceAt == null
      ? null
      : Math.max(0, Math.round((lagReferenceAt.getTime() - latestMoveAt.getTime()) / (1000 * 60)));

  return {
    mapId: map.id,
    generatedAt: new Date(),
    publishConfidenceThreshold: ACTIVE_SHAPE_CONFIDENCE,
    activeConfidenceThreshold: PROVISIONAL_SHAPE_CONFIDENCE,
    activeShapes: adjusted.activeShapes.sort((a, b) => b.confidence - a.confidence),
    provisionalShapes: adjusted.provisionalShapes.sort((a, b) => b.confidence - a.confidence),
    overrideShapes,
    effectiveShapes: adjusted.effectiveShapes.sort((a, b) => b.confidence - a.confidence),
    freshness: {
      latestMoveAt,
      latestOverrideAt,
      lagMinutes,
      stale: lagMinutes != null ? lagMinutes >= LENS_FRESHNESS_STALE_MINUTES : false,
    },
    comparison: {
      genericShapeCount: shapeCandidates.length,
      activeShapeCount: adjusted.activeShapes.length,
      provisionalShapeCount: adjusted.provisionalShapes.length,
      overrideShapeCount: overrideShapes.length,
      promotedShapeIds: adjusted.promotedShapeIds,
      suppressedShapeIds: adjusted.suppressedShapeIds,
    },
  };
}

export function derivePennyShapes(nodes: ThoughtNodeModel[]): PennyShape[] {
  return buildPennyShapeCandidates(nodes).filter((shape) => shape.confidence >= PROVISIONAL_SHAPE_CONFIDENCE);
}

export function buildBeliefGenealogy(nodes: ThoughtNodeModel[], nodeId: string): BeliefGenealogy {
  const current = nodes.find((node) => node.id === nodeId) ?? null;

  if (!current) {
    return { current: null, lineage: [], contradictions: [], dependents: [] };
  }

  const lineage: ThoughtNodeModel[] = [];
  const seen = new Set<string>();
  let cursor: ThoughtNodeModel | null = current;

  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    lineage.push(cursor);
    const supersedesNodeId: string | null = cursor.supersedesNodeId;
    cursor = supersedesNodeId ? nodes.find((candidate) => candidate.id === supersedesNodeId) ?? null : null;
  }

  const dependents = nodes.filter(
    (candidate) => candidate.parentId === current.id || candidate.supersedesNodeId === current.id,
  );
  const contradictions = nodes.filter((candidate) =>
    lineage.some((ancestor) => {
      const sharesParent = ancestor.parentId !== null && candidate.parentId === ancestor.parentId && candidate.id !== ancestor.id;
      const directCounterArgument = sharesParent && candidate.kind === "counter_argument";
      const supersedingAncestor = candidate.supersedesNodeId === ancestor.id;
      const contradictedSource = sharesParent && candidate.nodeStatus === "superseded";

      return directCounterArgument || supersedingAncestor || contradictedSource;
    }),
  );

  return {
    current,
    lineage: lineage.reverse(),
    contradictions,
    dependents,
  };
}

export function buildClaimDependencyGraph(map: ThoughtMapModel): ClaimDependencyGraph {
  const nodes = map.nodes.filter((node) => node.nodeStatus !== "superseded");
  const rootNodeIds = nodes.filter((node) => node.parentId == null || node.kind === "root").map((node) => node.id);
  const edges: ClaimDependencyEdge[] = [];
  const seenEdges = new Set<string>();

  for (const node of nodes) {
    if (node.parentId) {
      const key = `parent:${node.parentId}->${node.id}`;
      if (!seenEdges.has(key)) {
        seenEdges.add(key);
        const targetNode = node;
        const sourceNode = nodes.find((candidate) => candidate.id === node.parentId) ?? null;
        edges.push({
          fromNodeId: node.parentId,
          toNodeId: node.id,
          relation: "parent",
          strengthScore: sourceNode ? dependencyStrengthScore(sourceNode, targetNode, "parent") : 50,
          contradictionScore: sourceNode ? dependencyContradictionScore(sourceNode, targetNode, "parent") : 20,
          recencyDays: sourceNode ? recencyDaysFromDates(sourceNode.updatedAt, targetNode.updatedAt) : 0,
        });
      }
    }

    if (node.supersedesNodeId) {
      const key = `supersedes:${node.supersedesNodeId}->${node.id}`;
      if (!seenEdges.has(key)) {
        seenEdges.add(key);
        const targetNode = node;
        const sourceNode = nodes.find((candidate) => candidate.id === node.supersedesNodeId) ?? null;
        edges.push({
          fromNodeId: node.supersedesNodeId,
          toNodeId: node.id,
          relation: "supersedes",
          strengthScore: sourceNode ? dependencyStrengthScore(sourceNode, targetNode, "supersedes") : 58,
          contradictionScore: sourceNode ? dependencyContradictionScore(sourceNode, targetNode, "supersedes") : 38,
          recencyDays: sourceNode ? recencyDaysFromDates(sourceNode.updatedAt, targetNode.updatedAt) : 0,
        });
      }
    }
  }

  const outgoingCounts = new Map<string, number>();
  for (const edge of edges) {
    outgoingCounts.set(edge.fromNodeId, (outgoingCounts.get(edge.fromNodeId) ?? 0) + 1);
  }

  const loadBearingNodeIds = Array.from(
    new Set(
      nodes
        .filter(
          (node) =>
            rootNodeIds.includes(node.id) ||
            (outgoingCounts.get(node.id) ?? 0) >= 2 ||
            (node.scores?.dependencyRisk ?? 0) > 0.55 ||
            (node.scores?.centrality ?? 0) > 0.58,
        )
        .map((node) => node.id),
    ),
  );

  return {
    nodeIds: nodes.map((node) => node.id),
    rootNodeIds,
    loadBearingNodeIds,
    edges,
  };
}

export function buildOldSelfTimeline(
  nodes: ThoughtNodeModel[],
  events: ThoughtMapEvent[],
  nodeId: string,
): OldSelfSnapshot[] {
  const genealogy = buildBeliefGenealogy(nodes, nodeId);
  const eventByNodeId = new Map(
    events
      .filter((event) => event.eventType === "move_applied")
      .map((event) => [event.nodeId ?? "", event]),
  );

  return genealogy.lineage.map((node, index) => {
    const event = eventByNodeId.get(node.id);
    const confidence = node.scores?.confidence ?? null;

    return {
      id: `${node.id}:${index}`,
      nodeId: node.id,
      versionLabel: index === genealogy.lineage.length - 1 ? "current self" : `old self ${index + 1}`,
      content: node.content,
      note: node.note ?? "",
      confidence,
      updatedAt: node.updatedAt,
      moveLabel: moveLabelForNode(node, event),
      moveSummary: event?.payload?.action
        ? `Penny applied a ${String(event.payload.action).replaceAll("_", " ")} move here.`
        : node.actionOrigin
          ? `This version was created by a ${node.actionOrigin.replaceAll("_", " ")} move.`
          : "This is the original captured claim.",
      status: node.nodeStatus,
      isCurrent: node.id === nodeId,
    };
  });
}

export function buildMapTimeline(map: ThoughtMapModel): MapTimelineSnapshot {
  const entries: MapTimelineEntry[] = [];
  for (const event of map.events) {
    if (event.eventType === "move_applied") {
      const action = typeof event.payload?.action === "string" ? String(event.payload.action).replaceAll("_", " ") : "move";
      const updatedCount = Array.isArray(event.payload?.updatedNodeIds) ? event.payload.updatedNodeIds.length : 0;
      const createdCount = Array.isArray(event.payload?.createdNodeIds) ? event.payload.createdNodeIds.length : 0;

      entries.push({
        id: event.id,
        label: "Claim moved",
        summary: `${action[0]?.toUpperCase() ?? "M"}${action.slice(1)} move touched ${createdCount} created and ${updatedCount} updated node${updatedCount === 1 ? "" : "s"}.`,
        createdAt: event.createdAt,
        nodeId: event.nodeId,
        accent: "revision",
      });
      continue;
    }

    if (event.eventType === "confidence_override") {
      const reasoning = typeof event.payload?.reasoning === "string" ? String(event.payload.reasoning).trim() : "";

      entries.push({
        id: event.id,
        label: "Confidence shifted",
        summary: reasoning
          ? `The user explained why confidence should hold: ${reasoning.slice(0, 140)}${reasoning.length > 140 ? "…" : ""}`
          : "A confidence override was recorded for this branch.",
        createdAt: event.createdAt,
        nodeId: event.nodeId,
        accent: "confidence",
      });
      continue;
    }

    if (event.eventType === "dialectic_round") {
      const title = typeof event.payload?.title === "string" ? String(event.payload.title) : "Dialectic round";
      const response = typeof event.payload?.response === "string" ? String(event.payload.response).trim() : "";
      const critiqueType =
        typeof event.payload?.critiqueType === "string" && String(event.payload.critiqueType).trim().length > 0
          ? String(event.payload.critiqueType).trim()
          : "";

      entries.push({
        id: event.id,
        label: title,
        summary: response
          ? `Stress-test response${critiqueType ? ` · ${critiqueType}` : ""}: ${response.slice(0, 140)}${response.length > 140 ? "…" : ""}`
          : "A dialectic round was recorded against this branch.",
        createdAt: event.createdAt,
        nodeId: event.nodeId,
        accent: "stress",
      });
      continue;
    }

    if (event.eventType === "challenge_calibration") {
      const label = typeof event.payload?.label === "string" ? String(event.payload.label) : "challenge calibration";
      const direction = typeof event.payload?.direction === "string" ? String(event.payload.direction) : "hold steady";
      const note = typeof event.payload?.note === "string" ? String(event.payload.note).trim() : "";

      entries.push({
        id: event.id,
        label: "Challenge calibration",
        summary: note
          ? `${label}: ${direction}. ${note.slice(0, 120)}${note.length > 120 ? "…" : ""}`
          : `${label}: ${direction}.`,
        createdAt: event.createdAt,
        nodeId: event.nodeId,
        accent: "confidence",
      });
      continue;
    }

    if (event.eventType === "shape_feedback") {
      const verdict = typeof event.payload?.verdict === "string" ? String(event.payload.verdict) : "feedback";
      const reasoning = typeof event.payload?.reasoning === "string" ? String(event.payload.reasoning).trim() : "";

      entries.push({
        id: event.id,
        label: "Shape feedback",
        summary: reasoning
          ? `The shape was marked ${verdict} because: ${reasoning.slice(0, 140)}${reasoning.length > 140 ? "…" : ""}`
          : `The shape was marked ${verdict}.`,
        createdAt: event.createdAt,
        nodeId: event.nodeId,
        accent: verdict === "confirmed" ? "resolution" : "shape",
      });
      continue;
    }

    if (event.eventType === "bias_detected" || event.eventType === "bias_resolved") {
      const detector = typeof event.payload?.detector === "string" ? String(event.payload.detector).replaceAll("_", " ") : "bias";

      entries.push({
        id: event.id,
        label: event.eventType === "bias_detected" ? "Stress signal" : "Stress signal resolved",
        summary:
          event.eventType === "bias_detected"
            ? `${detector} pressure showed up in the map.`
            : `${detector} pressure got named and softened.`,
        createdAt: event.createdAt,
        nodeId: event.nodeId,
        accent: event.eventType === "bias_detected" ? "stress" : "resolution",
      });
    }
  }

  for (const node of map.nodes) {
    entries.push({
      id: `node:${node.id}`,
      label: node.kind.replaceAll("_", " "),
      summary: `Claim appeared as ${node.content.slice(0, 140)}${node.content.length > 140 ? "…" : ""}`,
      createdAt: node.createdAt,
      nodeId: node.id,
      accent: node.nodeStatus === "superseded" ? "resolution" : "claim",
    });
  }

  const sortedEntries = entries.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  return {
    mapId: map.id,
    title: map.title,
    entries: sortedEntries,
    summary:
      sortedEntries.length > 0
        ? "Time-lapse of claims appearing, being stress-tested, revised, and resolved."
        : "The map has not produced a timeline yet.",
  };
}

export function buildShapeTimeline(map: ThoughtMapModel, shape: PennyShape | null): ShapeTimelineSnapshot | null {
  if (!shape) {
    return null;
  }

  const supportingNodes = shape.evidenceNodeIds
    .map((nodeId) => map.nodes.find((node) => node.id === nodeId) ?? null)
    .filter((node): node is ThoughtNodeModel => node != null)
    .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
  const relatedEvents = map.events
    .filter(
      (event) =>
        event.eventType === "shape_feedback" &&
        typeof event.payload?.shapeId === "string" &&
        String(event.payload.shapeId) === shape.id,
    )
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const trail: ShapeTimelineStep[] = [];
  let previousConfidence: number | null = null;

  for (const node of supportingNodes) {
    const confidence = node.scores?.confidence ?? null;
    const tone: ShapeTimelineTone =
      previousConfidence == null || confidence == null
        ? "steady"
        : confidence > previousConfidence
          ? "strengthened"
          : confidence < previousConfidence
            ? "weakened"
            : "steady";

    trail.push({
      id: node.id,
      label: `${node.kind.replaceAll("_", " ")} move`,
      summary: `${node.content.slice(0, 120)}${node.content.length > 120 ? "…" : ""}`,
      createdAt: node.updatedAt,
      nodeId: node.id,
      confidence,
      tone,
    });

    previousConfidence = confidence ?? previousConfidence;
  }

  for (const event of relatedEvents) {
    const verdict = typeof event.payload?.verdict === "string" ? String(event.payload.verdict) : "feedback";
    const reasoning = typeof event.payload?.reasoning === "string" ? String(event.payload.reasoning).trim() : "";

    trail.push({
      id: event.id,
      label: `Shape ${verdict}`,
      summary: reasoning
        ? reasoning.slice(0, 120) + (reasoning.length > 120 ? "…" : "")
        : `The user marked this shape as ${verdict}.`,
      createdAt: event.createdAt,
      nodeId: typeof event.payload?.nodeId === "string" ? String(event.payload.nodeId) : null,
      confidence: verdict === "confirmed" ? Math.min(100, shape.confidence + 8) : verdict === "refined" ? Math.max(0, shape.confidence - 4) : Math.max(0, shape.confidence - 14),
      tone: verdict === "confirmed" ? "strengthened" : verdict === "refined" ? "steady" : "weakened",
    });
  }

  trail.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const confidenceValues = trail
    .map((step) => step.confidence)
    .filter((confidence): confidence is number => confidence != null);

  return {
    shapeId: shape.id,
    label: shape.label,
    confidence: shape.confidence,
    firstSeenAt: trail[0]?.createdAt ?? null,
    confidenceRange: confidenceValues.length
      ? {
          min: Math.min(...confidenceValues),
          max: Math.max(...confidenceValues),
        }
      : { min: null, max: null },
    trail,
  };
}

export function buildDependencyChainTimeline(map: ThoughtMapModel, nodeId: string): DependencyChainTimelineSnapshot | null {
  const genealogy = buildBeliefGenealogy(map.nodes, nodeId);
  const dependencyGraph = buildClaimDependencyGraph(map);
  const loadBearingNodeIds = new Set(dependencyGraph.loadBearingNodeIds);
  const current = genealogy.current;

  if (!current) {
    return null;
  }

  const steps: DependencyChainTimelineStep[] = genealogy.lineage.map((node, index) => ({
    id: `${node.id}:${index}`,
    nodeId: node.id,
    label: index === 0 ? "foundation" : node.kind.replaceAll("_", " "),
    summary: node.content.slice(0, 140) + (node.content.length > 140 ? "…" : ""),
    createdAt: node.createdAt,
    relation:
      index === 0
        ? "root"
        : node.supersedesNodeId === genealogy.lineage[index - 1]?.id
          ? "supersedes"
          : "parent",
    loadBearing: loadBearingNodeIds.has(node.id),
  }));

  const dependents = genealogy.dependents
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(0, 4)
    .map((node) => ({
      id: `dependent:${node.id}`,
      nodeId: node.id,
      label: "downstream dependent",
      summary: node.content.slice(0, 140) + (node.content.length > 140 ? "…" : ""),
      createdAt: node.createdAt,
      relation: "dependent" as const,
      loadBearing: loadBearingNodeIds.has(node.id),
    }));

  return {
    nodeId: current.id,
    label: current.content,
    steps: [...steps, ...dependents].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
  };
}

export function buildClaimMoveHistory(
  nodes: ThoughtNodeModel[],
  events: ThoughtMapEvent[],
  nodeId: string,
): ClaimMoveHistoryEntry[] {
  const genealogy = buildBeliefGenealogy(nodes, nodeId);
  const nodeIds = new Set(genealogy.lineage.map((node) => node.id));

  return events
    .filter((event) => event.nodeId ? nodeIds.has(event.nodeId) : false)
    .map((event) => {
      if (event.eventType === "move_applied") {
        const action = typeof event.payload?.action === "string" ? String(event.payload.action).replaceAll("_", " ") : "move";

        return {
          id: event.id,
          label: "Move applied",
          summary: `Penny applied a ${action} move.`,
          createdAt: event.createdAt,
          accent: "move",
        } satisfies ClaimMoveHistoryEntry;
      }

      if (event.eventType === "bias_detected" || event.eventType === "bias_resolved") {
        const detector = typeof event.payload?.detector === "string" ? String(event.payload.detector).replaceAll("_", " ") : "bias signal";

        return {
          id: event.id,
          label: event.eventType === "bias_detected" ? "Signal detected" : "Signal resolved",
          summary:
            event.eventType === "bias_detected"
              ? `Penny detected ${detector} pressure on this branch.`
              : `Penny logged the resolution of ${detector} pressure on this branch.`,
          createdAt: event.createdAt,
          accent: "signal",
        } satisfies ClaimMoveHistoryEntry;
      }

      if (event.eventType === "shape_feedback") {
        const verdict = typeof event.payload?.verdict === "string" ? String(event.payload.verdict) : "feedback";
        const reasoning = typeof event.payload?.reasoning === "string" ? String(event.payload.reasoning).trim() : "";

        return {
          id: event.id,
          label: "Shape feedback",
          summary: reasoning
            ? `The user marked the associated shape as ${verdict} and said: ${reasoning.slice(0, 120)}${reasoning.length > 120 ? "…" : ""}`
            : `The user marked the associated shape as ${verdict}.`,
          createdAt: event.createdAt,
          accent: "feedback",
        } satisfies ClaimMoveHistoryEntry;
      }

    if (event.eventType === "dialectic_round") {
      const round = typeof event.payload?.round === "string" ? String(event.payload.round) : "round";
      const responsePath = typeof event.payload?.responsePath === "string" ? String(event.payload.responsePath) : "response";
      const response = typeof event.payload?.response === "string" ? String(event.payload.response).trim() : "";
      const critiqueStrength = typeof event.payload?.critiqueStrength === "string" ? String(event.payload.critiqueStrength) : "unknown";
      const critiqueType =
        typeof event.payload?.critiqueType === "string" && String(event.payload.critiqueType).trim().length > 0
          ? String(event.payload.critiqueType).trim()
          : "";

        return {
          id: event.id,
          label: `${round} recorded`,
          summary: response
            ? `The ${round.toLowerCase()} thread persisted a ${responsePath} response at ${critiqueStrength} strength${critiqueType ? ` (${critiqueType})` : ""}: ${response.slice(0, 120)}${response.length > 120 ? "…" : ""}`
            : `The ${round.toLowerCase()} thread persisted a ${responsePath} response at ${critiqueStrength} strength${critiqueType ? ` (${critiqueType})` : ""}.`,
          createdAt: event.createdAt,
          accent: "feedback",
        } satisfies ClaimMoveHistoryEntry;
      }

      if (event.eventType === "challenge_calibration") {
        const label = typeof event.payload?.label === "string" ? String(event.payload.label) : "challenge calibration";
        const direction = typeof event.payload?.direction === "string" ? String(event.payload.direction) : "hold steady";
        const note = typeof event.payload?.note === "string" ? String(event.payload.note).trim() : "";

        return {
          id: event.id,
          label: "Challenge calibration",
          summary: note
            ? `${label} nudged Penny to ${direction}. ${note.slice(0, 120)}${note.length > 120 ? "…" : ""}`
            : `${label} nudged Penny to ${direction}.`,
          createdAt: event.createdAt,
          accent: "signal",
        } satisfies ClaimMoveHistoryEntry;
      }

      if (event.eventType === "confidence_override") {
        const reasoning = typeof event.payload?.reasoning === "string" ? String(event.payload.reasoning).trim() : "";
        const mode = typeof event.payload?.mode === "string" ? String(event.payload.mode).trim() : "hold";

        return {
          id: event.id,
          label: "Confidence override",
          summary: reasoning
            ? `The user asked Penny to ${mode === "reduce" ? "tighten" : "soften"} the cascade and said: ${reasoning.slice(0, 120)}${reasoning.length > 120 ? "…" : ""}`
            : `The user asked Penny to ${mode === "reduce" ? "tighten" : "soften"} the cascade.`,
          createdAt: event.createdAt,
          accent: "feedback",
        } satisfies ClaimMoveHistoryEntry;
      }

      return {
        id: event.id,
        label: event.eventType.replaceAll("_", " "),
        summary: "An event was recorded for this claim.",
        createdAt: event.createdAt,
        accent: "signal",
      } satisfies ClaimMoveHistoryEntry;
    })
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export function buildConfusionLog(map: ThoughtMapModel): ConfusionLogEntry[] {
  const activeNodes = map.nodes.filter((node) => node.nodeStatus !== "superseded" && node.kind !== "root");
  const weakNodes = activeNodes
    .map((node) => ({
      node,
      severity: Math.round(
        Math.max(
          0,
          (1 - (node.scores?.evidence ?? 1)) * 40 +
            (1 - (node.psychology?.falsificationCoverageScore ?? 1)) * 30 +
            (1 - (node.psychology?.comparisonCoverageScore ?? 1)) * 20 +
            Math.min(10, (node.scores?.dependencyRisk ?? 0) * 10),
        ),
      ),
    }))
    .filter(({ severity }) => severity >= 25)
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 4);
  const capture = captureSnapshotForMap(map);
  const entries: ConfusionLogEntry[] = weakNodes.map(({ node, severity }) => {
    const ageDays = Math.max(0, Math.floor((Date.now() - node.updatedAt.getTime()) / (1000 * 60 * 60 * 24)));
    const why = [];

    if ((node.scores?.evidence ?? 1) < 0.55) why.push("evidence is still thin");
    if ((node.psychology?.falsificationCoverageScore ?? 1) < 0.55) why.push("the counter-case is not load-bearing yet");
    if ((node.scores?.dependencyRisk ?? 0) > 0.55) why.push("the branch carries hidden dependency risk");
    if ((node.psychology?.comparisonCoverageScore ?? 1) < 0.55) why.push("the comparison set is too weak");

    return {
      nodeId: node.id,
      title: `${node.kind.replaceAll("_", " ")} needs another pass`,
      confusion: `${node.content}${why.length ? ` because ${why.join(", ")}.` : "."}`,
      nextStep:
        node.kind === "research"
          ? "Ask for one concrete test, one source, and one way this claim could fail."
          : node.kind === "counter_argument"
            ? "Add the strongest version of the opposing case before you refine the claim."
            : "Force a specific test or a missing dependency before treating this as stable.",
      severity,
      ageDays,
      revisitPrompt:
        ageDays >= 90
          ? "You sat with this question months ago. Revisit whether anything has changed."
          : ageDays >= 30
            ? "This confusion has aged enough to deserve another pass."
            : "Keep the confusion open until the next useful signal appears.",
    };
  });

  if (capture?.dependencyNotes?.trim()) {
    entries.push({
      nodeId: map.nodes.find((node) => node.kind === "root")?.id ?? map.id,
      title: "Capture dependency note",
      confusion: `The capture includes dependency notes that should be pulled into the graph: ${capture.dependencyNotes}.`,
      nextStep: "Turn the note into a concrete dependency edge or a revisiting task.",
      severity: 42,
      ageDays: 0,
      revisitPrompt: "Dependency notes should be translated into the graph before they go stale.",
    });
  }

  return entries.sort((a, b) => b.severity - a.severity).slice(0, 5);
}

export function collectShapeFeedback(events: ThoughtMapEvent[]) {
  return events.reduce<Record<string, PennyShapeFeedback>>((accumulator, event) => {
    if (event.eventType !== "shape_feedback") {
      return accumulator;
    }

    const shapeId = typeof event.payload?.shapeId === "string" ? event.payload.shapeId : null;
    const verdict = event.payload?.verdict;

    if (!shapeId || (verdict !== "confirmed" && verdict !== "rejected" && verdict !== "refined")) {
      return accumulator;
    }

    accumulator[shapeId] = verdict;
    return accumulator;
  }, {});
}

export function shapeFeedbackPayload(params: {
  shapeId: string;
  verdict: PennyShapeFeedback;
  shapeLabel: string;
  source: string;
  reasoning: string;
  nodeId?: string | null;
}) {
  return {
    shapeId: params.shapeId,
    verdict: params.verdict,
    shapeLabel: params.shapeLabel,
    source: params.source,
    reasoning: params.reasoning,
    nodeId: params.nodeId ?? null,
  };
}

export function findActiveShapeCallout(
  node: ThoughtNodeModel | null,
  shapes: PennyShape[],
  lens?: PennyLensSnapshot | null,
): PennyShape | null {
  if (!node || !shapes.length) {
    return null;
  }

  const nodeText = node.content.toLowerCase();
  const activeThreshold = lens?.publishConfidenceThreshold ?? ACTIVE_SHAPE_CONFIDENCE;
  const lensShapes = lens?.effectiveShapes ?? shapes;
  const activeShapes = lensShapes.filter((shape) => shape.confidence >= activeThreshold);

  return (
    activeShapes.find((shape) => shape.evidenceNodeIds.includes(node.id)) ??
    activeShapes.find((shape) => shape.signals.some((signal) => nodeText.includes(signal))) ??
    null
  );
}

export function formatShapeVerdict(verdict: ShapeVerdict) {
  return verdict.replaceAll("_", " ");
}

export function buildCalibrationDashboard(maps: ThoughtMapModel[]): CalibrationDashboardSnapshot {
  const resolvedClaims: ForecastClaimSnapshot[] = [];
  const privateBets: PrivateBetSnapshot[] = [];
  const prompts: BayesianUpdatePrompt[] = [];
  const domainBuckets = new Map<
    CalibrationDomain,
    Array<{ confidence: number; outcome: number | null; brierScore: number | null }>
  >();

  for (const map of maps) {
    const capture = parseClaimCaptureMetadata(map.rawThought);

    if (!capture) {
      continue;
    }

    const text = `${map.title} ${map.rawThought} ${map.nodes.map((node) => node.content).join(" ")}`;
    const domain = classifyCalibrationDomain(text);
    const confidence = capture.confidence;
    const outcome = capture.status === "resolved" ? 1 : capture.status === "abandoned" || capture.status === "stale" ? 0 : null;
    const brierScore = outcome == null ? null : Number(((confidence / 100 - outcome) ** 2).toFixed(3));
    const evidenceSignal = clampConfidence(
      Math.round(
        average(
          map.nodes
            .filter((node) => node.kind !== "root" && node.scores?.evidence != null)
            .map((node) => node.scores?.evidence ?? 0),
        ) ?? 0,
      ),
    );
    const shift = bayesianShift({ confidence, evidenceSignal, outcome });
    const prompt =
      shift === 0
        ? `Hold at ${confidence}%. Evidence and confidence are close enough to keep the bet steady.`
        : shift < 0
          ? `Evidence is lagging confidence here. Nudge this down by about ${Math.abs(shift)} points and look for one falsifier.`
          : `Evidence is outrunning confidence. Nudge this up by about ${shift} points and see if the claim is too modest.`;

    const snapshot: ForecastClaimSnapshot = {
      mapId: map.id,
      title: map.title,
      domain,
      confidence,
      outcome,
      brierScore,
      status: capture.status,
      resolutionDate: capture.resolutionDate,
      provenance: capture.provenance,
      stakes: capture.stakes,
      personalCredibilityStake: credibilityLabel(confidence, capture.stakes),
      evidenceSignal,
      bayesianShift: shift,
      updatePrompt: prompt,
      updatedAt: map.updatedAt,
    };

    if (outcome != null) {
      resolvedClaims.push(snapshot);
    }

    if (capture.resolutionDate && (capture.status === "open" || capture.status === "revisiting")) {
      privateBets.push({
        mapId: map.id,
        title: map.title,
        domain,
        confidence,
        resolutionDate: capture.resolutionDate,
        status: capture.status,
        stakes: capture.stakes,
        credibilityLabel: credibilityLabel(confidence, capture.stakes),
        prompt: `This looks like a ${credibilityLabel(confidence, capture.stakes)} private bet. Revisit it on ${capture.resolutionDate} and score whether your confidence was justified.`,
      });
    }

    if (shift !== 0 || outcome == null) {
      prompts.push({
        mapId: map.id,
        title: map.title,
        domain,
        evidenceSignal,
        suggestedShift: shift,
        prompt,
      });
    }

    const bucket = domainBuckets.get(domain) ?? [];
    bucket.push({ confidence, outcome, brierScore });
    domainBuckets.set(domain, bucket);
  }

  const domains = Array.from(domainBuckets.entries()).map(([domain, entries]) => {
    const averageConfidence = average(entries.map((entry) => entry.confidence)) ?? 0;
    const resolvedEntries = entries.filter((entry) => entry.outcome != null);
    const averageOutcomeRate = average(resolvedEntries.map((entry) => entry.outcome as number));
    const averageBrierScore = average(resolvedEntries.map((entry) => entry.brierScore ?? 0));
    const calibrationGap =
      averageOutcomeRate == null ? null : Number(((averageConfidence / 100 - averageOutcomeRate) * 100).toFixed(1));

    return {
      domain,
      sampleSize: entries.length,
      averageConfidence: Math.round(averageConfidence),
      averageOutcomeRate: averageOutcomeRate == null ? null : Number((averageOutcomeRate * 100).toFixed(1)),
      averageBrierScore: averageBrierScore == null ? null : Number(averageBrierScore.toFixed(3)),
      calibrationGap,
      note:
        domain === "technical"
          ? "Technical claims usually tolerate smaller update steps."
          : domain === "market"
            ? "Market calls should be nudged harder when evidence stays thin."
            : domain === "operational"
              ? "Operational forecasts should be checked against execution friction."
              : domain === "research"
                ? "Research claims should lean on evidence first, confidence second."
                : domain === "people"
                  ? "People claims tend to drift when the social cost is undercounted."
                  : "General claims need more evidence before they deserve a steep forecast.",
    };
  });

  return {
    resolvedClaims: resolvedClaims.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
    domains: domains.sort((a, b) => a.domain.localeCompare(b.domain)),
    privateBets: privateBets.sort((a, b) => b.confidence - a.confidence),
    prompts: prompts.sort((a, b) => b.evidenceSignal - a.evidenceSignal),
    postMortems: buildClaimPostMortems(resolvedClaims),
  };
}

export function buildMemoryTimeDashboard(maps: ThoughtMapModel[]): MemoryTimeDashboard {
  const calibration = buildCalibrationDashboard(maps);
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const beliefDigests = maps
    .map((map) => {
      const recentUpdates = map.nodes
        .filter((node) => node.kind !== "root" && node.updatedAt.getTime() - node.createdAt.getTime() > 0)
        .filter((node) => Date.now() - node.updatedAt.getTime() <= thirtyDaysMs)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

      if (!recentUpdates.length) {
        return null;
      }

      const updatedBeliefs = recentUpdates.slice(0, 3).map((node) => `${node.kind.replaceAll("_", " ")} · ${node.content.slice(0, 90)}${node.content.length > 90 ? "…" : ""}`);

      return {
        mapId: map.id,
        title: map.title,
        updatedBeliefCount: recentUpdates.length,
        updatedBeliefs,
        summary: `You updated ${recentUpdates.length} beliefs in the last 30 days.`,
        reviewPrompt: "Want to trace why these beliefs moved?",
        updatedAt: recentUpdates[0]?.updatedAt ?? map.updatedAt,
      };
    })
    .filter((item): item is BeliefDigestSnapshot => item !== null)
    .sort((a, b) => b.updatedBeliefCount - a.updatedBeliefCount || b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 4);

  const velocityBuckets = new Map<
    CalibrationDomain,
    Array<{
      updateCount: number;
      lagDays: number | null;
    }>
  >();

  for (const map of maps) {
    const text = `${map.title} ${map.rawThought} ${map.nodes.map((node) => node.content).join(" ")}`;
    const domain = classifyCalibrationDomain(text);
    const updatedNodes = map.nodes.filter((node) => node.kind !== "root" && node.updatedAt.getTime() - node.createdAt.getTime() > 0);
    const lagDays = updatedNodes.length
      ? average(updatedNodes.map((node) => recencyDaysFromDates(node.createdAt, node.updatedAt)))
      : null;
    const bucket = velocityBuckets.get(domain) ?? [];
    bucket.push({
      updateCount: updatedNodes.length,
      lagDays,
    });
    velocityBuckets.set(domain, bucket);
  }

  const beliefVelocity = Array.from(velocityBuckets.entries())
    .map(([domain, entries]) => {
      const sampleSize = entries.length;
      const updateCount = entries.reduce((sum, entry) => sum + entry.updateCount, 0);
      const averageLagDays = average(entries.map((entry) => entry.lagDays ?? 0));
      const normalizedLag = averageLagDays == null ? null : Number(averageLagDays.toFixed(1));
      const updateRate = sampleSize ? updateCount / sampleSize : 0;
      const velocityLabel: BeliefVelocitySnapshot["velocityLabel"] =
        updateRate >= 5 ? "volatile" : updateRate <= 1.5 ? "rigid" : "steady";

      return {
        domain,
        sampleSize,
        updateCount,
        averageLagDays: normalizedLag,
        velocityLabel,
        summary:
          velocityLabel === "volatile"
            ? "Beliefs are changing quickly in this domain, so Penny should watch for overreaction."
            : velocityLabel === "rigid"
              ? "Beliefs are changing slowly here, so Penny should test whether the user is getting stuck."
              : "Beliefs are moving at a workable rate in this domain.",
      };
    })
    .sort((a, b) => a.domain.localeCompare(b.domain));

  const decisionInfluence = maps
    .flatMap((map) => {
      const entries = map.events
        .filter((event) => event.eventType === "dialectic_round" || event.eventType === "confidence_override")
        .map((event) => {
          if (event.eventType === "dialectic_round") {
            const round = typeof event.payload?.round === "string" ? String(event.payload.round) : "round";
            const responsePath = typeof event.payload?.responsePath === "string" ? String(event.payload.responsePath) : "response";
            const response = typeof event.payload?.response === "string" ? String(event.payload.response).trim() : "";

            return {
              mapId: map.id,
              title: map.title,
              summary: response
                ? `Penny changed the direction of ${round.toLowerCase()} into a ${responsePath} response: ${response.slice(0, 120)}${response.length > 120 ? "…" : ""}`
                : `Penny changed the direction of ${round.toLowerCase()} into a ${responsePath} response.`,
              changedDirection: responsePath,
              updatedAt: event.createdAt,
            } satisfies DecisionInfluenceSnapshot;
          }

          const mode = typeof event.payload?.mode === "string" ? String(event.payload.mode) : "hold";
          const reasoning = typeof event.payload?.reasoning === "string" ? String(event.payload.reasoning).trim() : "";

          return {
            mapId: map.id,
            title: map.title,
            summary: reasoning
              ? `Penny adjusted the dependency edge with a ${mode} override: ${reasoning.slice(0, 120)}${reasoning.length > 120 ? "…" : ""}`
              : `Penny adjusted the dependency edge with a ${mode} override.`,
            changedDirection: mode,
            updatedAt: event.createdAt,
          } satisfies DecisionInfluenceSnapshot;
        });

      return entries;
    })
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 5);

  return {
    beliefDigests,
    predictionRetrospectives: calibration.postMortems.slice(0, 4).map((postMortem) => ({
      mapId: postMortem.mapId,
      title: postMortem.title,
      domain: postMortem.domain,
      confidence: postMortem.confidence,
      resolutionDate: postMortem.resolutionDate,
      brierScore: postMortem.brierScore,
      reviewPrompt: postMortem.reviewPrompt,
      summary: postMortem.lesson,
      updatedAt: postMortem.updatedAt,
    })),
    beliefVelocity,
    decisionInfluence,
  };
}

function communitySourceKey(snapshot: ClaimCaptureSnapshot) {
  if (snapshot.provenance === "intuition") {
    return null;
  }

  const normalized = snapshot.provenanceDetail.trim().toLowerCase();
  return normalized.length ? normalized : null;
}

function communitySourceLabel(snapshot: ClaimCaptureSnapshot) {
  if (snapshot.provenance === "intuition") {
    return "intuition";
  }

  return snapshot.provenanceDetail.trim() || snapshot.provenance;
}

export function buildCommunityCommonsDashboard(
  maps: ThoughtMapModel[],
  allNodes: ThoughtNodeModel[] = maps.flatMap((map) => map.nodes),
): CommunityCommonsDashboard {
  const calibration = buildCalibrationDashboard(maps);
  const captures = maps
    .map((map) => captureSnapshotForMap(map))
    .filter((snapshot): snapshot is ClaimCaptureSnapshot => snapshot !== null);
  const shapes = derivePennyShapes(allNodes);
  const mapDomainById = new Map(
    maps.map((map) => {
      const text = `${map.title} ${map.rawThought} ${map.nodes.map((node) => node.content).join(" ")}`;
      return [map.id, classifyCalibrationDomain(text)] as const;
    }),
  );

  const contributions = calibration.postMortems.slice(0, 4).map((postMortem) => ({
    displayLabel: `${postMortem.domain} post-mortem`,
    summary: postMortem.lesson,
    reviewGate: "Anonymized, structured, and review-gated before sharing.",
    sourceHint: `Shape signal: ${postMortem.shapeSignal}.`,
    updatedAt: postMortem.updatedAt,
  }));

  const sourceGroups = new Map<string, ClaimCaptureSnapshot[]>();
  for (const capture of captures) {
    const key = communitySourceKey(capture);

    if (!key) {
      continue;
    }

    const bucket = sourceGroups.get(key) ?? [];
    bucket.push(capture);
    sourceGroups.set(key, bucket);
  }

  const contradictionSignals = Array.from(sourceGroups.entries())
    .map(([, group]) => {
      const statusSet = new Set(group.map((snapshot) => snapshot.status));
      const mixedStatuses = statusSet.size > 1;
      const resolvedCount = group.filter((snapshot) => snapshot.status === "resolved").length;
      const revisitingCount = group.filter((snapshot) => snapshot.status === "revisiting").length;
      const signalStrength = group.length + (mixedStatuses ? 2 : 0) + (resolvedCount > 0 && revisitingCount > 0 ? 2 : 0);

      return {
        sourceLabel: communitySourceLabel(group[0]!),
        mapCount: group.length,
        summary: mixedStatuses
          ? "One captured belief chain is holding this source as another has already moved away from it."
          : "This source appears in multiple captures and deserves privacy-safe contradiction monitoring.",
        privacyNote: "Only source-level aggregation is surfaced here; no raw cross-user graph is exposed.",
        updatedAt: group.reduce(
          (latest, snapshot) => (snapshot.updatedAt.getTime() > latest.getTime() ? snapshot.updatedAt : latest),
          group[0]?.updatedAt ?? new Date(0),
        ),
        signalStrength,
      };
    })
    .filter((signal) => signal.signalStrength > 1)
    .sort((a, b) => b.signalStrength - a.signalStrength)
    .slice(0, 4)
    .map(({ signalStrength, ...signal }) => {
      void signalStrength;
      return signal;
    });

  const openQuestions = maps
    .map((map) => {
      const unresolvedCount =
        (map.graphSnapshot?.weakestNodeIds.length ?? 0) +
        (map.graphSnapshot?.criticalDependencyIds.length ?? 0) +
        map.nodes.filter((node) => node.nodeStatus !== "superseded" && node.kind === "research").length;

      const activeNodeCount = map.nodes.filter((node) => node.nodeStatus !== "superseded").length;

      return {
        topic: map.title,
        unresolvedCount,
        summary:
          unresolvedCount > 0
            ? `${unresolvedCount} weak or still-open branches remain across ${activeNodeCount} active nodes.`
            : "The current map does not expose an obvious unresolved-question cluster yet.",
        researchPrompt:
          unresolvedCount > 0
            ? "Promote the unresolved branch into a research task or a community review candidate."
            : "Keep watching for a repeated question pattern before surfacing it publicly.",
        updatedAt: map.updatedAt,
      };
    })
    .filter((question) => question.unresolvedCount > 0)
    .sort((a, b) => b.unresolvedCount - a.unresolvedCount)
    .slice(0, 4);

  const shapeLibrary = shapes
    .map((shape) => ({
      label: shape.label,
      kind: shape.kind,
      mapCount: shape.sourceMapIds.length,
      confidence: shape.confidence,
      summary: shape.summary,
    }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 4);

  const mapShapeLabels = new Map<string, Set<string>>();
  for (const shape of shapes) {
    for (const mapId of shape.sourceMapIds) {
      const bucket = mapShapeLabels.get(mapId) ?? new Set<string>();
      bucket.add(shape.label);
      mapShapeLabels.set(mapId, bucket);
    }
  }

  const thoughtPartnerMatches = maps
    .flatMap((left, leftIndex) => {
      const leftShapes = mapShapeLabels.get(left.id) ?? new Set<string>();
      const leftDomain = mapDomainById.get(left.id) ?? "general";
      const matches: ThoughtPartnerMatchSnapshot[] = [];

      for (let index = leftIndex + 1; index < maps.length; index += 1) {
        const right = maps[index];
        const rightShapes = mapShapeLabels.get(right.id) ?? new Set<string>();
        const sharedShapes = Array.from(leftShapes).filter((shape) => rightShapes.has(shape));
        const rightDomain = mapDomainById.get(right.id) ?? "general";
        const domainOverlap = leftDomain === rightDomain ? 1 : 0;
        const score = sharedShapes.length + domainOverlap;

        if (score < 2) {
          continue;
        }

        matches.push({
          mapIds: [left.id, right.id],
          titles: [left.title, right.title],
          sharedShapes,
          reason:
            sharedShapes.length > 0
              ? `Both maps are carrying ${sharedShapes.slice(0, 2).join(", ")} patterns, which makes a targeted one-to-one comparison useful.`
              : "The maps live in the same domain and deserve a bounded, targeted comparison.",
          privacyNote: "Matching should stay opt-in, one-to-one, and bounded to the shared pattern surface.",
        });
      }

      return matches;
    })
    .slice(0, 4);

  return {
    contributions,
    contradictionSignals,
    openQuestions,
    shapeLibrary,
    thoughtPartnerMatches,
  };
}

function stakeLabel(stake: string) {
  return stake.replaceAll("_", " ");
}

function counterShapePrompt(label: string, summary: string) {
  const lower = `${label} ${summary}`.toLowerCase();

  if (lower.includes("market") || lower.includes("distribution")) {
    return "Force the opposite test: what if the real failure is operational, not market?";
  }

  if (lower.includes("confidence") || lower.includes("overconfident")) {
    return "Force the opposite test: what evidence would make the claim stronger rather than weaker?";
  }

  if (lower.includes("abstraction") || lower.includes("specificity")) {
    return "Force the opposite test: what concrete decision would break if this stayed abstract?";
  }

  if (lower.includes("confirmation") || lower.includes("familiar")) {
    return "Force the opposite test: what is the strongest disconfirming case this shape keeps missing?";
  }

  return "Force the opposite test: what critique would matter if this pattern were exactly backwards?";
}

export function buildAdvancedThinkingDashboard(
  maps: ThoughtMapModel[],
  allNodes: ThoughtNodeModel[] = maps.flatMap((map) => map.nodes),
): AdvancedThinkingDashboard {
  const allShapes = derivePennyShapes(allNodes);
  const emotionalStructureShapes = Array.from(
    maps.reduce((accumulator, map) => {
      const capture = captureSnapshotForMap(map);

      if (!capture?.stakes.length) {
        return accumulator;
      }

      for (const stake of capture.stakes) {
        const bucket = accumulator.get(stake) ?? [];
        bucket.push(map);
        accumulator.set(stake, bucket);
      }

      return accumulator;
    }, new Map<ClaimStake, ThoughtMapModel[]>()),
  )
    .map(([stake, stakeMaps]) => {
      const relevantNodes = stakeMaps.flatMap((map) =>
        map.nodes.filter(
          (node) =>
            node.kind !== "root" &&
            ((node.scores?.dependencyRisk ?? 0) > 0.48 ||
              (node.psychology?.falsificationCoverageScore ?? 1) < 0.68 ||
              (node.scores?.confidence ?? 0) > 0.68),
        ),
      );

      return {
        stake: stakeLabel(stake),
        mapCount: stakeMaps.length,
        summary:
          stake === "self_image"
            ? "You under-stress-test claims when self-image is on the line, so the first challenge often needs to be gentler but firmer."
            : stake === "reputation"
              ? "You should slow down and pressure-test the public cost before treating this as a routine claim."
              : stake === "money"
                ? "The financial risk should trigger more explicit downside testing than ordinary claims."
                : stake === "relationship"
                  ? "Relationship stakes usually hide in tone and timing, so the emotional cost deserves its own review."
                  : "This stake changes the shape of the critique and deserves its own explicit pressure test.",
        prompt:
          relevantNodes.length > 0
            ? `Use the ${stakeLabel(stake)} stake to ask where the stress-test got softer than it should have been.`
            : `Watch for new claims tagged with ${stakeLabel(stake)} and turn them into a specific stress-test.`,
      } satisfies EmotionalStructureShapeSnapshot;
    })
    .sort((a, b) => b.mapCount - a.mapCount)
    .slice(0, 5);

  const confusionLog = maps.flatMap((map) => buildConfusionLog(map)).sort((a, b) => b.severity - a.severity).slice(0, 5);

  const assumptionArchaeology = maps
    .map((map) => {
      const assumptions = map.nodes
        .filter((node) => node.kind === "assumption" && node.nodeStatus !== "superseded")
        .map((node) => node.content)
        .slice(0, 3);
      const capture = captureSnapshotForMap(map);
      const hiddenScaffold = assumptions.length
        ? `You're assuming ${assumptions.slice(0, 3).join("; ")}.`
        : capture?.dependencyNotes.trim()
          ? `You're assuming ${capture.dependencyNotes.trim()}.`
          : "The map is still hiding its scaffold. Add at least one explicit assumption.";

      return {
        mapId: map.id,
        title: map.title,
        assumptions,
        hiddenScaffold,
        updatedAt: map.updatedAt,
      };
    })
    .filter((item) => item.assumptions.length > 0 || item.hiddenScaffold !== "The map is still hiding its scaffold. Add at least one explicit assumption.")
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 4);

  const counterShapes = allShapes
    .slice()
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 4)
    .map((shape) => ({
      label: shape.label,
      reason: `Counter-shape mode deliberately tests against "${shape.label}" so the lens does not become an echo chamber.`,
      counterTest: counterShapePrompt(shape.label, shape.summary),
      updatedAt: new Date(),
    }));

  const confidenceResets = maps
    .map((map) => {
      const capture = captureSnapshotForMap(map);
      const confidence = capture?.confidence ?? null;

      if (confidence == null) {
        return null;
      }

      const ageDays = Math.max(0, Math.floor((Date.now() - map.updatedAt.getTime()) / (1000 * 60 * 60 * 24)));

      return {
        mapId: map.id,
        title: map.title,
        ageDays,
        confidence,
        resetPrompt:
          ageDays >= 90
            ? `You have not revisited confidence on this claim in ${ageDays} days. Reassess it now.`
            : ageDays >= 30
              ? `This claim is aging. Recheck whether ${confidence}% still feels right.`
              : `Confidence is still fresh enough to keep monitoring, not resetting.`,
        updatedAt: map.updatedAt,
      };
    })
    .filter((item): item is ConfidenceResetSnapshot => item !== null && item.ageDays >= 30)
    .sort((a, b) => b.ageDays - a.ageDays)
    .slice(0, 5);

  const patternCounts = new Map<string, { count: number; maps: Set<string>; summary: string; handleItLikeThis: string }>();
  for (const shape of allShapes) {
    const bucket = patternCounts.get(shape.label) ?? {
      count: 0,
      maps: new Set<string>(),
      summary: shape.summary,
      handleItLikeThis: `You handled this pattern by using ${shape.explanation.toLowerCase()}`,
    };

    bucket.count += 1;
    for (const mapId of shape.sourceMapIds) {
      bucket.maps.add(mapId);
    }
    patternCounts.set(shape.label, bucket);
  }

  const crossProjectPatterns = Array.from(patternCounts.entries())
    .map(([label, bucket]) => ({
      label,
      mapCount: bucket.maps.size,
      summary:
        bucket.maps.size >= 2
          ? `${bucket.maps.size} project${bucket.maps.size === 1 ? "" : "s"} have shown a version of this weakness.`
          : bucket.summary,
      handleItLikeThis: bucket.handleItLikeThis,
    }))
    .filter((pattern) => pattern.mapCount >= 2)
    .sort((a, b) => b.mapCount - a.mapCount)
    .slice(0, 5);

  return {
    emotionalStructureShapes,
    confusionLog,
    assumptionArchaeology,
    counterShapes,
    confidenceResets,
    crossProjectPatterns,
  };
}
