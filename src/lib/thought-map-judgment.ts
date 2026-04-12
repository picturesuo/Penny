import { analyzeThoughtMap, scoreNodeQuality } from "@/lib/thought-map-analysis";
import type {
  CognitiveIntervention,
  CognitiveInterventionType,
  InteractionMode,
  NodePsychologyMeta,
  NodeAction,
  RecommendationReason,
  ThinkingBias,
  ThoughtMapActionResult,
  ThoughtMapGraphSnapshot,
  ThoughtMapModel,
  ThoughtMapRecommendedMove,
  ThoughtNodeKind,
  ThoughtNodeModel,
  ThoughtNodeScores,
} from "@/types/thought-map";

type ScoredNode = ThoughtNodeModel & {
  scores: ThoughtNodeScores;
  psychology: NodePsychologyMeta;
};

type RankedMove = {
  action: NodeAction;
  priority: number;
  reasonCodes: RecommendationReason[];
  headline: string;
  explanation: string;
  expectedOutcome: string;
  interactionMode: InteractionMode;
};

type RankedIntervention = {
  type: CognitiveInterventionType;
  detector: ThinkingBias;
  targetNodeId: string;
  priority: number;
  triggerReason: string;
  prompt: string;
  inputMode: InteractionMode;
};

const COVERAGE_TARGETS: Record<ThoughtNodeKind, number> = {
  root: 1,
  core_claim: 2,
  why_it_matters: 2,
  assumption: 2,
  counter_argument: 2,
  research: 2,
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function roundScore(value: number) {
  return Math.round(clamp01(value) * 100) / 100;
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function kindCoverage(count: number, kind: ThoughtNodeKind) {
  return roundScore(count / COVERAGE_TARGETS[kind]);
}

function nodeCentrality(node: ThoughtNodeModel, map: ThoughtMapModel) {
  const childCount = map.nodes.filter((candidate) => candidate.parentId === node.id).length;
  const directRootChild = node.parentId === map.nodes.find((candidate) => candidate.kind === "root")?.id;
  const kindWeight =
    node.kind === "assumption"
      ? 0.28
      : node.kind === "core_claim"
        ? 0.24
        : node.kind === "why_it_matters"
          ? 0.2
          : node.kind === "counter_argument"
            ? 0.16
            : node.kind === "research"
              ? 0.14
              : 0.12;

  return roundScore(kindWeight + (directRootChild ? 0.26 : 0.1) + Math.min(childCount * 0.12, 0.36));
}

function nodeCoverage(node: ThoughtNodeModel, map: ThoughtMapModel) {
  const children = map.nodes.filter((candidate) => candidate.parentId === node.id);
  const uniqueKinds = new Set(children.map((candidate) => candidate.kind)).size;

  return roundScore(Math.min(children.length / 3, 1) * 0.65 + Math.min(uniqueKinds / 3, 1) * 0.35);
}

function nodeTestability(node: ThoughtNodeModel, quality: ReturnType<typeof scoreNodeQuality>) {
  if (node.kind === "research") {
    return roundScore(Math.max(quality.dimensions.concreteness, quality.dimensions.specificity) / 100);
  }

  if (node.kind === "assumption") {
    return roundScore((quality.dimensions.concreteness * 0.65 + quality.dimensions.specificity * 0.35) / 100);
  }

  return roundScore((quality.dimensions.concreteness * 0.7 + quality.dimensions.tension * 0.3) / 100);
}

function nodeEvidence(node: ThoughtNodeModel, quality: ReturnType<typeof scoreNodeQuality>) {
  if (node.kind === "research") {
    return roundScore((quality.dimensions.concreteness * 0.75 + quality.dimensions.tension * 0.25) / 100);
  }

  return roundScore((quality.dimensions.concreteness * 0.55 + quality.dimensions.tension * 0.45) / 100);
}

function nodeDependencyRisk(
  node: ThoughtNodeModel,
  scores: Pick<ThoughtNodeScores, "centrality" | "evidence">,
) {
  const kindRisk =
    node.kind === "assumption"
      ? 0.92
      : node.kind === "core_claim"
        ? 0.82
        : node.kind === "why_it_matters"
          ? 0.68
          : node.kind === "counter_argument"
            ? 0.4
            : node.kind === "research"
              ? 0.45
              : 0.35;

  return roundScore(scores.centrality * kindRisk * (1 - scores.evidence * 0.55));
}

function nodeConfidence(quality: ReturnType<typeof scoreNodeQuality>) {
  const issuePenalty = quality.issues.length * 0.08;
  return roundScore(quality.total / 100 - issuePenalty + 0.18);
}

function toNodeScores(node: ThoughtNodeModel, map: ThoughtMapModel): ThoughtNodeScores {
  const quality = scoreNodeQuality(node, map);
  const centrality = nodeCentrality(node, map);
  const evidence = nodeEvidence(node, quality);
  const specificity = roundScore(quality.dimensions.specificity / 100);
  const tension = roundScore(quality.dimensions.tension / 100);
  const coverage = nodeCoverage(node, map);
  const novelty = roundScore(quality.dimensions.redundancy / 100);
  const testability = nodeTestability(node, quality);
  const dependencyRisk = nodeDependencyRisk(node, { centrality, evidence });
  const confidence = nodeConfidence(quality);

  return {
    strength: roundScore(quality.total / 100),
    evidence,
    specificity,
    testability,
    novelty,
    dependencyRisk,
    centrality,
    tension,
    coverage,
    confidence,
  };
}

function comparisonCoverage(node: ThoughtNodeModel, map: ThoughtMapModel) {
  const siblings = map.nodes.filter((candidate) => candidate.parentId === node.parentId && candidate.id !== node.id);
  const challengingSiblings = siblings.filter(
    (candidate) => candidate.kind === "counter_argument" || candidate.kind === "research",
  ).length;

  return roundScore(Math.min(challengingSiblings / 2, 1));
}

function falsificationCoverage(node: ThoughtNodeModel, map: ThoughtMapModel) {
  const directChildren = map.nodes.filter((candidate) => candidate.parentId === node.id);
  const challengeChildren = directChildren.filter(
    (candidate) => candidate.kind === "counter_argument" || candidate.kind === "research",
  ).length;
  const globalCounterweight = map.nodes.filter((candidate) => candidate.kind === "counter_argument").length;

  return roundScore(Math.min(challengeChildren / 2, 1) * 0.7 + Math.min(globalCounterweight / 3, 1) * 0.3);
}

function actionabilityScore(node: ThoughtNodeModel, scores: ThoughtNodeScores) {
  if (node.kind === "research") {
    return roundScore(scores.testability * 0.55 + scores.evidence * 0.25 + scores.coverage * 0.2);
  }

  return roundScore(scores.testability * 0.45 + scores.evidence * 0.25 + scores.specificity * 0.3);
}

function detectBiases(params: {
  node: ThoughtNodeModel;
  map: ThoughtMapModel;
  scores: ThoughtNodeScores;
  ambiguityScore: number;
  actionabilityScore: number;
}): ThinkingBias[] {
  const { node, map, scores, ambiguityScore, actionabilityScore } = params;
  const siblings = map.nodes.filter((candidate) => candidate.parentId === node.parentId && candidate.id !== node.id);
  const hasCounterweight = siblings.some(
    (candidate) => candidate.kind === "counter_argument" || candidate.kind === "research",
  );
  const hasStakesBranch = map.nodes.some((candidate) => candidate.kind === "why_it_matters");
  const hasResearchBranch = map.nodes.some((candidate) => candidate.kind === "research");
  const biases = new Set<ThinkingBias>();

  if (
    (node.kind === "core_claim" || node.kind === "assumption" || node.kind === "why_it_matters") &&
    !hasCounterweight &&
    scores.tension < 0.48
  ) {
    biases.add("confirmation_bias");
  }

  if (scores.specificity < 0.45 || ambiguityScore > 0.58 || actionabilityScore < 0.45) {
    biases.add("shallow_abstraction");
  }

  if ((node.kind === "core_claim" || node.kind === "assumption") && scores.evidence < 0.4 && scores.tension < 0.45) {
    biases.add("overconfidence");
  }

  if ((node.kind === "core_claim" || node.kind === "assumption") && (!hasStakesBranch || !hasResearchBranch)) {
    biases.add("solution_first_thinking");
  }

  if (siblings.length >= 5 || siblings.filter((candidate) => candidate.kind === node.kind).length >= 3) {
    biases.add("option_overload");
  }

  return Array.from(biases);
}

function toNodePsychology(node: ThoughtNodeModel, map: ThoughtMapModel, scores: ThoughtNodeScores): NodePsychologyMeta {
  const ambiguityScore = roundScore((1 - scores.specificity) * 0.65 + (1 - scores.evidence) * 0.35);
  const comparisonCoverageScore = comparisonCoverage(node, map);
  const falsificationCoverageScore = falsificationCoverage(node, map);
  const actionability = actionabilityScore(node, scores);

  return {
    ambiguityScore,
    comparisonCoverageScore,
    falsificationCoverageScore,
    actionabilityScore: actionability,
    likelyBiases: detectBiases({
      node,
      map,
      scores,
      ambiguityScore,
      actionabilityScore: actionability,
    }),
  };
}

function applyNodeJudgment(map: ThoughtMapModel): ScoredNode[] {
  return map.nodes.map((node) => {
    const scores = toNodeScores(node, map);

    return {
      ...node,
      scores,
      psychology: toNodePsychology(node, map, scores),
    };
  });
}

function liveNodes(nodes: ScoredNode[]) {
  return nodes.filter((node) => node.nodeStatus !== "superseded");
}

function buildRepetitiveClusters(nodes: ScoredNode[]): ThoughtMapGraphSnapshot["repetitiveClusters"] {
  const repetitive = nodes.filter((node) => node.kind !== "root" && node.scores.novelty < 0.6);
  const groups = new Map<string, ScoredNode[]>();

  for (const node of repetitive) {
    const key = `${node.parentId ?? "root"}:${node.kind}`;
    groups.set(key, [...(groups.get(key) ?? []), node]);
  }

  return Array.from(groups.entries())
    .filter(([, clusterNodes]) => clusterNodes.length >= 2)
    .map(([key, clusterNodes]) => ({
      clusterId: key,
      nodeIds: clusterNodes.map((node) => node.id),
      label: `Repeated ${clusterNodes[0]?.kind.replaceAll("_", " ") ?? "branch"} branch`,
      similarityScore: roundScore(1 - average(clusterNodes.map((node) => node.scores.novelty))),
    }));
}

function buildGraphSnapshot(map: ThoughtMapModel, nodes: ScoredNode[]): ThoughtMapGraphSnapshot {
  const currentNodes = liveNodes(nodes);
  const rootNode = currentNodes.find((node) => node.kind === "root");
  const graphAnalysis = rootNode
    ? analyzeThoughtMap({
        map: { ...map, nodes: currentNodes },
        node: rootNode,
        action: "expand",
      })
    : null;
  const nodeCounts = currentNodes.reduce<Record<ThoughtNodeKind, number>>(
    (acc, node) => {
      acc[node.kind] += 1;
      return acc;
    },
    {
      root: 0,
      core_claim: 0,
      why_it_matters: 0,
      assumption: 0,
      counter_argument: 0,
      research: 0,
    },
  );

  return {
    projectId: map.id,
    generatedAt: new Date().toISOString(),
    totalNodes: nodes.length,
    activeNodes: nodes.filter((node) => node.nodeStatus === "active").length,
    weakNodes: nodes.filter((node) => node.nodeStatus === "weak").length,
    validatedNodes: 0,
    supersededNodes: nodes.filter((node) => node.nodeStatus === "superseded").length,
    branchCoverage: {
      root: kindCoverage(nodeCounts.root, "root"),
      core_claim: kindCoverage(nodeCounts.core_claim, "core_claim"),
      why_it_matters: kindCoverage(nodeCounts.why_it_matters, "why_it_matters"),
      assumption: kindCoverage(nodeCounts.assumption, "assumption"),
      counter_argument: kindCoverage(nodeCounts.counter_argument, "counter_argument"),
      research: kindCoverage(nodeCounts.research, "research"),
    },
    repetitiveClusters: buildRepetitiveClusters(currentNodes),
    weakestNodeIds: currentNodes
      .filter((node) => node.kind !== "root")
      .sort((a, b) => a.scores.strength - b.scores.strength)
      .slice(0, 5)
      .map((node) => node.id),
    criticalDependencyIds: currentNodes
      .filter(
        (node) =>
          node.kind !== "root" &&
          (node.kind === "assumption" || node.kind === "core_claim" || node.kind === "why_it_matters") &&
          node.scores.dependencyRisk > 0.7,
      )
      .sort((a, b) => b.scores.dependencyRisk - a.scores.dependencyRisk)
      .slice(0, 5)
      .map((node) => node.id),
    missingNodeTypes: graphAnalysis?.missingKinds ?? [],
    overallScore: roundScore(average(currentNodes.filter((node) => node.kind !== "root").map((node) => node.scores.strength))),
  };
}

export function chooseInteractionMode(node: ThoughtNodeModel, action: NodeAction): InteractionMode {
  if (action === "connect" && node.kind === "counter_argument") return "multi_select";
  if (action === "concretize" && node.kind === "assumption") return "guided_slots";
  if (action === "challenge" && node.kind === "core_claim") return "forced_contrast";
  if (action === "connect") return "rank_choices";
  if (action === "expand" && (node.scores?.strength ?? 0) > 0.7) return "free_text";
  return "guided_slots";
}

function moveSummary(headline: string, expectedOutcome: string) {
  return `${headline} ${expectedOutcome}`.trim();
}

function interventionPrompt(type: CognitiveInterventionType, node: ScoredNode) {
  switch (type) {
    case "force_falsification":
      return `What would make "${node.content}" fail, and what evidence would prove that quickly?`;
    case "require_slots":
      return `Make this concrete: state the claim, the real condition that must be true, and the clearest failure case.`;
    case "convert_to_test":
      return `Turn this branch into one concrete test with a user, threshold, and disconfirming result.`;
    case "require_priority_rank":
      return `Rank the most important unknowns here before adding more branches.`;
    case "reduce_choices":
      return `Focus on the top 2 moves only and ignore the rest for this turn.`;
  }
}

function interventionInputMode(type: CognitiveInterventionType, node: ScoredNode): InteractionMode {
  if (type === "force_falsification") {
    return node.kind === "core_claim" ? "forced_contrast" : "guided_slots";
  }

  if (type === "require_slots" || type === "convert_to_test") {
    return "guided_slots";
  }

  if (type === "require_priority_rank") {
    return "rank_choices";
  }

  return "single_select";
}

function buildIntervention(node: ScoredNode, intervention: RankedIntervention, mapId: string): CognitiveIntervention {
  const now = new Date();

  return {
    id: `intervention:${mapId}:${intervention.targetNodeId}:${intervention.type}`,
    mapId,
    targetNodeId: intervention.targetNodeId,
    type: intervention.type,
    detector: intervention.detector,
    triggerReason: intervention.triggerReason,
    prompt: intervention.prompt,
    inputMode: intervention.inputMode,
    status: "open",
    outcomeDelta: null,
    createdAt: now,
    updatedAt: now,
    shownAt: now,
    completedAt: null,
    dismissedAt: null,
  };
}

function interventionPriority(intervention: CognitiveIntervention) {
  if (intervention.type === "force_falsification") return 91;
  if (intervention.type === "require_slots") return 88;
  if (intervention.type === "convert_to_test") return 84;
  if (intervention.type === "require_priority_rank") return 78;
  return 72;
}

function recommendInterventionsForNode(
  node: ScoredNode,
  siblingNodes: ScoredNode[],
  map: ThoughtMapModel,
): CognitiveIntervention[] {
  const candidates: RankedIntervention[] = [];
  const psychology = node.psychology;
  const sameKindSiblings = siblingNodes.filter((candidate) => candidate.kind === node.kind).length;

  if (psychology.likelyBiases.includes("confirmation_bias")) {
    candidates.push({
      type: "force_falsification",
      detector: "confirmation_bias",
      targetNodeId: node.id,
      priority: 91,
      triggerReason: "The branch is accumulating support without enough direct opposition or disproof.",
      prompt: interventionPrompt("force_falsification", node),
      inputMode: interventionInputMode("force_falsification", node),
    });
  }

  if (psychology.likelyBiases.includes("shallow_abstraction")) {
    candidates.push({
      type: "require_slots",
      detector: "shallow_abstraction",
      targetNodeId: node.id,
      priority: 88,
      triggerReason: "The branch is still too vague to guide an immediate product or research decision.",
      prompt: interventionPrompt("require_slots", node),
      inputMode: interventionInputMode("require_slots", node),
    });
  }

  if (psychology.likelyBiases.includes("overconfidence")) {
    candidates.push({
      type: "convert_to_test",
      detector: "overconfidence",
      targetNodeId: node.id,
      priority: 84,
      triggerReason: "Confidence is outrunning evidence, so the branch should become a test instead of a belief.",
      prompt: interventionPrompt("convert_to_test", node),
      inputMode: interventionInputMode("convert_to_test", node),
    });
  }

  if (psychology.likelyBiases.includes("solution_first_thinking")) {
    candidates.push({
      type: "require_priority_rank",
      detector: "solution_first_thinking",
      targetNodeId: node.id,
      priority: 78,
      triggerReason: "The map is pushing a solution before ranking stakes, assumptions, and evidence needs.",
      prompt: interventionPrompt("require_priority_rank", node),
      inputMode: interventionInputMode("require_priority_rank", node),
    });
  }

  if (psychology.likelyBiases.includes("option_overload") || sameKindSiblings >= 4) {
    candidates.push({
      type: "reduce_choices",
      detector: "option_overload",
      targetNodeId: node.id,
      priority: 72,
      triggerReason: "There are enough adjacent options here that more choices will likely slow action selection.",
      prompt: interventionPrompt("reduce_choices", node),
      inputMode: interventionInputMode("reduce_choices", node),
    });
  }

  return candidates
    .sort((a, b) => b.priority - a.priority)
    .map((candidate) => buildIntervention(node, candidate, map.id));
}

function buildMove(
  node: ScoredNode,
  move: RankedMove,
  map: ThoughtMapModel,
): ThoughtMapRecommendedMove {
  const graphAnalysis = analyzeThoughtMap({
    map: { ...map, nodes: map.nodes.map((candidate) => candidate.id === node.id ? node : candidate) },
    node,
    action: move.action,
  });
  const targetNode =
    map.nodes.find((candidate) => candidate.id === graphAnalysis.actionSelection.targetNodeId) ?? node;
  const targetParentId =
    graphAnalysis.actionSelection.mode === "replace_weak_branch"
      ? targetNode.parentId
      : graphAnalysis.actionSelection.mode === "diversify_branches"
        ? targetNode.parentId ?? targetNode.id
        : targetNode.id;

  return {
    id: `move:${map.id}:${node.id}:${move.action}`,
    projectId: map.id,
    targetNodeId: targetNode.id,
    action: move.action,
    priority: Math.min(100, Math.round(move.priority)),
    reasonCodes: move.reasonCodes,
    headline: move.headline,
    summary: moveSummary(move.headline, move.expectedOutcome),
    explanation: move.explanation,
    expectedOutcome: move.expectedOutcome,
    interactionMode: move.interactionMode,
    targetNodeKind: targetNode.kind,
    targetNodeContent: targetNode.content,
    execution: {
      mode: graphAnalysis.actionSelection.mode,
      targetNodeId: targetNode.id,
      targetNodeKind: targetNode.kind,
      targetParentId,
      supersededNodeId: graphAnalysis.actionSelection.mode === "replace_weak_branch" ? targetNode.id : null,
    },
    reasoning: {
      primaryGap: graphAnalysis.primaryGap,
      secondaryGap: graphAnalysis.secondaryGap,
      coverage: graphAnalysis.coverage,
      why: graphAnalysis.actionSelection.why,
      reasons: graphAnalysis.reasons,
      weakNodes: graphAnalysis.weakNodes.map((weakNode) => ({
        nodeId: weakNode.nodeId,
        kind: weakNode.kind,
        content: weakNode.content,
        score: weakNode.total,
        issues: weakNode.issues,
      })),
    },
    generatedAt: new Date().toISOString(),
    acceptedAt: null,
    dismissedAt: null,
    executedAt: null,
  };
}

function recommendMovesForNode(
  node: ScoredNode,
  siblingNodes: ScoredNode[],
  map: ThoughtMapModel,
) {
  const moves: ThoughtMapRecommendedMove[] = [];
  const repetitive =
    node.scores.novelty < 0.58 ||
    siblingNodes.filter((sibling) => sibling.kind === node.kind && sibling.scores.novelty < 0.65).length >= 2;
  const weak =
    node.nodeStatus === "weak" ||
    node.scores.strength < 0.45 ||
    node.scores.specificity < 0.4 ||
    node.scores.evidence < 0.3 ||
    (node.scores.dependencyRisk > 0.75 && node.scores.evidence < 0.5);
  const central = node.scores.centrality > 0.7;
  const lowEvidence = node.scores.evidence < 0.4;
  const lowSpecificity = node.scores.specificity < 0.45;
  const fragile = node.scores.dependencyRisk > 0.7;

  if (node.kind === "assumption" && weak && (central || fragile)) {
    moves.push(
      buildMove(
        node,
        {
          action: "concretize",
          priority: 94,
          reasonCodes: ["untested_assumption", ...(fragile ? (["fragile_dependency"] as RecommendationReason[]) : [])],
          headline: "Replace this weak assumption",
          explanation:
            "This assumption is central to the map and still weak enough to collapse downstream reasoning.",
          expectedOutcome: "A more specific, testable assumption with a clearer failure condition.",
          interactionMode: chooseInteractionMode(node, "concretize"),
        },
        map,
      ),
    );
  }

  if ((node.kind === "why_it_matters" || node.kind === "core_claim") && lowSpecificity) {
    moves.push(
      buildMove(
        node,
        {
          action: "expand",
          priority: 86,
          reasonCodes: ["low_specificity", "weak_stakes"],
          headline: "Strengthen the reasoning here",
          explanation: "This branch matters, but it is still too abstract to guide a product decision.",
          expectedOutcome: "Sharper stakes or a clearer claim tied to a real consequence.",
          interactionMode: chooseInteractionMode(node, "expand"),
        },
        map,
      ),
    );
  }

  if (node.kind === "counter_argument" && repetitive) {
    moves.push(
      buildMove(
        node,
        {
          action: "connect",
          priority: 83,
          reasonCodes: ["repetitive_branch"],
          headline: "Diversify these objections",
          explanation: "The current objections repeat the same line of attack and are not broad enough yet.",
          expectedOutcome: "A wider challenge set across evidence, timing, and execution risk.",
          interactionMode: chooseInteractionMode(node, "connect"),
        },
        map,
      ),
    );
  }

  if (node.kind === "assumption" && lowEvidence) {
    moves.push(
      buildMove(
        node,
        {
          action: "concretize",
          priority: 80,
          reasonCodes: ["low_evidence", "untested_assumption"],
          headline: "Turn this into a validation step",
          explanation: "This assumption is important, but it is not yet supported by evidence or a clean test.",
          expectedOutcome: "A research prompt, metric, or explicit test that can disprove the branch.",
          interactionMode: chooseInteractionMode(node, "concretize"),
        },
        map,
      ),
    );
  }

  if (node.scores.coverage < 0.4 && node.scores.strength > 0.6) {
    moves.push(
      buildMove(
        node,
        {
          action: "expand",
          priority: 69,
          reasonCodes: ["missing_counterweight"],
          headline: "Expand this promising branch",
          explanation: "This branch looks stronger than average, but the surrounding reasoning is still thin.",
          expectedOutcome: "More complete support, opposition, or validation around this part of the map.",
          interactionMode: chooseInteractionMode(node, "expand"),
        },
        map,
      ),
    );
  }

  return moves;
}

function boostProjectMovePriority(
  move: ThoughtMapRecommendedMove,
  nodes: ScoredNode[],
  snapshot: ThoughtMapGraphSnapshot,
) {
  const target = nodes.find((node) => node.id === move.targetNodeId);

  if (!target) {
    return move;
  }

  let bonus = 0;
  if (snapshot.weakestNodeIds.includes(target.id)) bonus += 5;
  if (snapshot.criticalDependencyIds.includes(target.id)) bonus += 7;
  if (target.kind === "assumption" && target.scores.centrality > 0.75) bonus += 4;

  return {
    ...move,
    priority: Math.min(100, move.priority + bonus),
  };
}

export function buildThoughtMapJudgment(map: ThoughtMapModel) {
  const scoredNodes = applyNodeJudgment(map);
  const scoredMap: ThoughtMapModel = {
    ...map,
    nodes: scoredNodes,
    interventions: [],
    recommendedIntervention: null,
  };
  const snapshot = buildGraphSnapshot(scoredMap, scoredNodes);
  const currentNodes = liveNodes(scoredNodes);
  const candidates = currentNodes
    .filter((node) => node.kind !== "root")
    .flatMap((node) =>
      recommendMovesForNode(
        node,
        currentNodes.filter((candidate) => candidate.parentId === node.parentId && candidate.id !== node.id),
        scoredMap,
      ),
    )
    .map((move) => boostProjectMovePriority(move, currentNodes, snapshot))
    .sort((a, b) => b.priority - a.priority);
  const interventions = currentNodes
    .filter((node) => node.kind !== "root")
    .flatMap((node) =>
      recommendInterventionsForNode(
        node,
        currentNodes.filter((candidate) => candidate.parentId === node.parentId && candidate.id !== node.id),
        scoredMap,
      ),
    )
    .sort((a, b) => interventionPriority(b) - interventionPriority(a) || a.createdAt.getTime() - b.createdAt.getTime());

  return {
    nodes: scoredNodes,
    graphSnapshot: snapshot,
    recommendedNextMove: candidates[0] ?? null,
    interventions,
    recommendedIntervention: interventions[0] ?? null,
  };
}

export function buildThoughtMapActionResult(params: {
  action: NodeAction;
  beforeMap: ThoughtMapModel;
  afterMap: ThoughtMapModel;
  targetNodeId: string;
  createdNodeIds: string[];
  updatedNodeIds: string[];
}): ThoughtMapActionResult {
  const beforeNode = params.beforeMap.nodes.find((node) => node.id === params.targetNodeId);
  const replacementNode = params.afterMap.nodes.find((node) => node.supersedesNodeId === params.targetNodeId);
  const afterNode =
    replacementNode ??
    params.afterMap.nodes.find((node) => node.id === params.targetNodeId) ??
    null;

  return {
    action: params.action,
    targetNodeId: params.targetNodeId,
    createdNodeIds: params.createdNodeIds,
    updatedNodeIds: params.updatedNodeIds,
    beforeScores: beforeNode?.scores ?? {},
    afterScores: afterNode?.scores ?? {},
    summary:
      replacementNode
        ? "Replaced a weak branch with a stronger version."
        : params.createdNodeIds.length > 0
          ? "Added new reasoning around the targeted branch."
          : "Updated the targeted branch state.",
    explanation:
      replacementNode
        ? "The new branch is more specific and easier to validate than the node it superseded."
        : params.action === "concretize"
          ? "The action pushed the map toward evidence, thresholds, or a direct validation step."
          : params.action === "connect"
            ? "The action tied the branch into adjacent evidence or counterweight instead of adding another isolated note."
            : "The action expanded the graph around the selected branch without discarding the existing reasoning.",
  };
}
