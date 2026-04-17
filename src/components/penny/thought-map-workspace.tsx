"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { AlertCircle, ArrowRightLeft, CircleDot, GitBranchPlus, Link2, Sparkles } from "lucide-react";
import { FounderBriefCard } from "@/components/penny/founder-brief-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  buildClaimMoveHistory,
  buildBeliefGenealogy,
  buildDevilsAdvocateReceipts,
  buildConfidenceDecaySnapshot,
  buildSessionRhythmSnapshot,
  collectShapeFeedback,
  captureSnapshotForMap,
  buildOldSelfTimeline,
  derivePennyShapes,
  findActiveShapeCallout,
  formatShapeVerdict,
  interleaveStressNodes,
  retrievePrecedentsForNode,
  traceContradictionCascade,
  type PennyShapeFeedback,
} from "@/lib/penny-insights";
import { cn } from "@/lib/utils";
import type {
  CognitiveIntervention,
  FounderBriefModel,
  ThoughtMapGraphSnapshot,
  ThoughtMapEvent,
  ThoughtMapModel,
  ThoughtMapRecommendedMove,
  ThoughtNodeKind,
  ThoughtNodeModel,
} from "@/types/thought-map";

type SerializableThoughtNode = Omit<ThoughtNodeModel, "createdAt" | "updatedAt"> & {
  createdAt: Date | string;
  updatedAt: Date | string;
};

type SerializableThoughtMap = Omit<
  ThoughtMapModel,
  "nodes" | "createdAt" | "updatedAt" | "interventions" | "recommendedIntervention" | "founderBrief"
> & {
  nodes: SerializableThoughtNode[];
  events: SerializableThoughtMapEvent[];
  founderBrief: SerializableFounderBrief | null;
  interventions: SerializableIntervention[];
  recommendedIntervention: SerializableIntervention | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type SerializableFounderBrief = Omit<FounderBriefModel, "generatedAt"> & {
  generatedAt: Date | string;
};

type SerializableIntervention = Omit<
  CognitiveIntervention,
  "createdAt" | "updatedAt" | "shownAt" | "completedAt" | "dismissedAt"
> & {
  createdAt: Date | string;
  updatedAt: Date | string;
  shownAt: Date | string;
  completedAt: Date | string | null;
  dismissedAt: Date | string | null;
};

type SerializableThoughtMapEvent = Omit<ThoughtMapEvent, "createdAt"> & {
  createdAt: Date | string;
};

type ActionResponse = {
  action: string;
  createdNodes: SerializableThoughtNode[];
  updatedNodes: SerializableThoughtNode[];
  graphSnapshot?: ThoughtMapGraphSnapshot | null;
  interventions?: SerializableIntervention[];
  recommendedIntervention?: SerializableIntervention | null;
  recommendedNextMove?: ThoughtMapRecommendedMove | null;
  execution: {
    mode: "add_children" | "strengthen_branch" | "replace_weak_branch" | "diversify_branches";
    targetNodeId: string;
    targetNodeKind: ThoughtNodeKind;
    targetParentId: string | null;
    supersededNodeId: string | null;
  };
  reasoning: {
    graphAnalysis?: {
      primaryGap: string;
      secondaryGap: string | null;
      reasons: string[];
      weakNodes: Array<{
        nodeId: string;
        kind: ThoughtNodeKind;
        content: string;
        score: number;
        issues: string[];
      }>;
      actionSelection: {
        mode: "add_children" | "strengthen_branch" | "replace_weak_branch" | "diversify_branches";
        targetNodeId: string;
        targetNodeKind: ThoughtNodeKind;
        why: string[];
      };
    };
  };
};

type FounderBriefResponse = {
  map: SerializableThoughtMap;
};

type MapView = "outline" | "graph";

type PeerAudience = "skeptical investor" | "thesis advisor" | "skeptical academic" | "gtm operator";

type PositionedGraphNode = {
  node: ThoughtNodeModel;
  depth: number;
  x: number;
  y: number;
  isWeak: boolean;
  isCritical: boolean;
  childCount: number;
};

const GRAPH_NODE_WIDTH = 188;
const GRAPH_NODE_HEIGHT = 104;
const GRAPH_COLUMN_GAP = 232;
const GRAPH_ROW_GAP = 132;
const GRAPH_PADDING_X = 108;
const GRAPH_PADDING_Y = 76;

function toDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function normalizeIntervention(intervention: SerializableIntervention): CognitiveIntervention {
  return {
    ...intervention,
    createdAt: toDate(intervention.createdAt),
    updatedAt: toDate(intervention.updatedAt),
    shownAt: toDate(intervention.shownAt),
    completedAt: intervention.completedAt ? toDate(intervention.completedAt) : null,
    dismissedAt: intervention.dismissedAt ? toDate(intervention.dismissedAt) : null,
  };
}

function normalizeNode(node: SerializableThoughtNode): ThoughtNodeModel {
  return {
    ...node,
    createdAt: toDate(node.createdAt),
    updatedAt: toDate(node.updatedAt),
  };
}

function normalizeFounderBrief(brief: SerializableFounderBrief): FounderBriefModel {
  return {
    ...brief,
    generatedAt: toDate(brief.generatedAt),
  };
}

function normalizeEvent(event: SerializableThoughtMapEvent): ThoughtMapEvent {
  return {
    ...event,
    payload: event.payload ?? null,
    createdAt: toDate(event.createdAt),
  };
}

function normalizeMap(map: SerializableThoughtMap): ThoughtMapModel {
  return {
    ...map,
    nodes: map.nodes.map(normalizeNode),
    events: map.events.map(normalizeEvent),
    founderBrief: map.founderBrief ? normalizeFounderBrief(map.founderBrief) : null,
    interventions: map.interventions.map(normalizeIntervention),
    recommendedIntervention: map.recommendedIntervention ? normalizeIntervention(map.recommendedIntervention) : null,
    createdAt: toDate(map.createdAt),
    updatedAt: toDate(map.updatedAt),
  };
}

const ACTIONS = [
  { key: "expand", label: "Expand", icon: GitBranchPlus },
  { key: "challenge", label: "Challenge", icon: AlertCircle },
  { key: "invert", label: "Invert", icon: ArrowRightLeft },
  { key: "concretize", label: "Concrete", icon: Sparkles },
  { key: "connect", label: "Connect", icon: Link2 },
] as const;

function kindLabel(kind: ThoughtNodeKind) {
  return kind.replaceAll("_", " ");
}

function statusTone(status: ThoughtNodeModel["nodeStatus"]) {
  if (status === "weak") {
    return "border-[#b56f3a]/35 bg-[#fff6ed]";
  }

  if (status === "superseded") {
    return "border-black/6 bg-[#f4efe8] opacity-65";
  }

  return "border-black/10 bg-white";
}

function statusBadge(status: ThoughtNodeModel["nodeStatus"]) {
  if (status === "weak") {
    return "bg-[#f5d6b3] text-[#8b4d1f]";
  }

  if (status === "superseded") {
    return "bg-black/8 text-[var(--muted-ink)]";
  }

  return "bg-[#d9ead8] text-[#355b32]";
}

function countByStatus(nodes: ThoughtNodeModel[]) {
  return nodes.reduce(
    (acc, node) => {
      acc[node.nodeStatus] += 1;
      return acc;
    },
    { active: 0, weak: 0, superseded: 0 },
  );
}

function preferredGraphNodeId(map: ThoughtMapModel) {
  return (
    map.recommendedNextMove?.targetNodeId ??
    map.graphSnapshot?.weakestNodeIds[0] ??
    map.graphSnapshot?.criticalDependencyIds[0] ??
    map.nodes.find((node) => node.kind !== "root")?.id ??
    map.nodes[0]?.id ??
    null
  );
}

function formatScore(score: number | null | undefined) {
  if (score == null) {
    return "n/a";
  }

  return `${Math.round(score * 100)}`;
}

function topNodesBy(
  nodes: ThoughtNodeModel[],
  selector: (node: ThoughtNodeModel) => number,
  predicate?: (node: ThoughtNodeModel) => boolean,
) {
  return nodes
    .filter((node) => node.kind !== "root" && (predicate ? predicate(node) : true))
    .sort((a, b) => selector(b) - selector(a))
    .slice(0, 3);
}

function labelAction(action: ThoughtNodeModel["actionOrigin"]) {
  return action?.replaceAll("_", " ") ?? "";
}

function labelBias(bias: string) {
  return bias.replaceAll("_", " ");
}

export function ThoughtMapWorkspace({
  initialMap,
  initialView = "outline",
}: {
  initialMap: SerializableThoughtMap;
  initialView?: MapView;
}) {
  const [map, setMap] = useState(() => normalizeMap(initialMap));
  const [view, setView] = useState<MapView>(initialView);
  const [lastAction, setLastAction] = useState<ActionResponse | null>(null);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [selectedGraphNodeId, setSelectedGraphNodeId] = useState<string | null>(() =>
    preferredGraphNodeId(normalizeMap(initialMap)),
  );
  const [peerAudience, setPeerAudience] = useState<PeerAudience>("skeptical investor");
  const [shapeFeedback, setShapeFeedback] = useState<Record<string, PennyShapeFeedback>>(() =>
    collectShapeFeedback(normalizeMap(initialMap).events),
  );
  const [runningRecommendedMove, setRunningRecommendedMove] = useState(false);
  const [runningFounderBrief, setRunningFounderBrief] = useState(false);
  const [founderBriefError, setFounderBriefError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const nodesByParent = useMemo(() => {
    return map.nodes.reduce<Record<string, ThoughtNodeModel[]>>((acc, node) => {
      const key = node.parentId ?? "root";
      acc[key] ??= [];
      acc[key].push(node);
      acc[key].sort((a, b) => a.branchOrder - b.branchOrder || a.createdAt.getTime() - b.createdAt.getTime());
      return acc;
    }, {});
  }, [map.nodes]);

  const rootNode = map.nodes.find((node) => node.kind === "root");
  const statusCounts = countByStatus(map.nodes);
  const nodesById = useMemo(() => new Map(map.nodes.map((node) => [node.id, node])), [map.nodes]);
  const derivedShapes = useMemo(
    () => derivePennyShapes(map.nodes).sort((a, b) => b.confidence - a.confidence),
    [map.nodes],
  );
  const defaultGraphNodeId = preferredGraphNodeId(map);
  const activeNodes = map.nodes.filter((node) => node.nodeStatus !== "superseded");
  const unresolvedGaps = [
    ...(map.graphSnapshot?.weakestNodeIds.length
      ? [`${map.graphSnapshot.weakestNodeIds.length} weak ${map.graphSnapshot.weakestNodeIds.length === 1 ? "branch" : "branches"}`]
      : []),
    ...(map.graphSnapshot?.criticalDependencyIds.length
      ? [
          `${map.graphSnapshot.criticalDependencyIds.length} critical ${map.graphSnapshot.criticalDependencyIds.length === 1 ? "dependency" : "dependencies"}`,
        ]
      : []),
    ...map.founderBriefReadiness.missingRequirements.map((requirement) => `missing ${requirement.replaceAll("_", " ")}`),
  ];
  const weakEvidenceNodes = topNodesBy(
    activeNodes,
    (node) => 1 - (node.scores?.evidence ?? 0),
    (node) => (node.scores?.evidence ?? 1) < 0.55,
  );
  const contradictionNodes = topNodesBy(
    activeNodes,
    (node) =>
      Math.max(
        1 - (node.psychology?.falsificationCoverageScore ?? 1),
        node.psychology?.likelyBiases.includes("confirmation_bias") ? 0.95 : 0,
      ),
    (node) =>
      (node.psychology?.falsificationCoverageScore ?? 1) < 0.55 ||
      node.psychology?.likelyBiases.includes("confirmation_bias") === true,
  );
  const riskyDependencyNodes = topNodesBy(
    activeNodes,
    (node) => node.scores?.dependencyRisk ?? 0,
    (node) => (node.scores?.dependencyRisk ?? 0) > 0.55,
  );
  const missingComparisonNodes = topNodesBy(
    activeNodes,
    (node) =>
      Math.max(
        1 - (node.psychology?.comparisonCoverageScore ?? 1),
        node.psychology?.likelyBiases.includes("option_overload") ? 0.9 : 0,
      ),
    (node) =>
      (node.psychology?.comparisonCoverageScore ?? 1) < 0.55 ||
      node.psychology?.likelyBiases.includes("option_overload") === true,
  );
  const stressTestPasses = [
    {
      title: "Weak evidence",
      description: "Branches that still lack enough real support.",
      empty: "No obvious evidence gaps are dominating the map right now.",
      nodes: weakEvidenceNodes,
      metric: (node: ThoughtNodeModel) => `evidence ${formatScore(node.scores?.evidence ?? null)}`,
    },
    {
      title: "Contradictions",
      description: "Claims that still need stronger falsification or counterweight.",
      empty: "No major contradiction pressure is leading the map right now.",
      nodes: contradictionNodes,
      metric: (node: ThoughtNodeModel) =>
        node.psychology?.likelyBiases.includes("confirmation_bias")
          ? "confirmation bias risk"
          : `falsification ${formatScore(node.psychology?.falsificationCoverageScore ?? null)}`,
    },
    {
      title: "Risky dependencies",
      description: "Important branches that can break the map if they are wrong.",
      empty: "No dependency-risk hotspot is standing out yet.",
      nodes: riskyDependencyNodes,
      metric: (node: ThoughtNodeModel) => `dependency ${formatScore(node.scores?.dependencyRisk ?? null)}`,
    },
    {
      title: "Missing comparisons",
      description: "Places where the map still needs contrast, ranking, or alternatives.",
      empty: "Comparison coverage looks healthy in the current map slice.",
      nodes: missingComparisonNodes,
      metric: (node: ThoughtNodeModel) =>
        node.psychology?.likelyBiases.includes("option_overload")
          ? "option overload risk"
          : `comparison ${formatScore(node.psychology?.comparisonCoverageScore ?? null)}`,
    },
  ];
  const frameworkCritiques = [
    {
      label: "Game theory",
      focus: "How incentives change when the user, buyer, or rival can react strategically.",
      empty: "No strategic incentive mismatch is showing up as dominant.",
      nodes: topNodesBy(
        activeNodes,
        (node) => Math.max(node.scores?.dependencyRisk ?? 0, node.scores?.centrality ?? 0),
        (node) => (node.scores?.dependencyRisk ?? 0) > 0.5 || (node.scores?.centrality ?? 0) > 0.45,
      ),
    },
    {
      label: "Network effects",
      focus: "Where adoption loops, social reinforcement, or multi-sided pressure matter.",
      empty: "No obvious network-effect dependency is leading the map.",
      nodes: topNodesBy(
        activeNodes,
        (node) => Math.max(node.scores?.coverage ?? 0, node.scores?.centrality ?? 0),
        (node) => (node.scores?.coverage ?? 0) > 0.45 || (node.scores?.centrality ?? 0) > 0.5,
      ),
    },
    {
      label: "Operational",
      focus: "What breaks in the process, handoff, or day-to-day execution path.",
      empty: "No process bottleneck is standing out as the main failure point.",
      nodes: topNodesBy(
        activeNodes,
        (node) => Math.max(1 - (node.scores?.testability ?? 1), node.scores?.dependencyRisk ?? 0),
        (node) => (node.scores?.testability ?? 1) < 0.55 || (node.scores?.dependencyRisk ?? 0) > 0.55,
      ),
    },
    {
      label: "Psychological",
      focus: "What bias, self-deception, or motivation trap could distort the claim.",
      empty: "No obvious psychological trap is dominating the current slice.",
      nodes: topNodesBy(
        activeNodes,
        (node) => Math.max(node.psychology?.ambiguityScore ?? 0, node.scores?.confidence ? 1 - node.scores.confidence : 0),
        (node) => (node.psychology?.ambiguityScore ?? 0) > 0.45,
      ),
    },
    {
      label: "Political",
      focus: "Who gains, who resists, and where coalition or status pressure could block the idea.",
      empty: "No explicit power or coalition tension is leading the map.",
      nodes: topNodesBy(
        activeNodes,
        (node) => Math.max(node.scores?.centrality ?? 0, node.scores?.dependencyRisk ?? 0),
        (node) => (node.scores?.centrality ?? 0) > 0.5 && (node.scores?.dependencyRisk ?? 0) > 0.4,
      ),
    },
    {
      label: "Historical",
      focus: "What precedent says this structure usually collapses into or survives as.",
      empty: "No obvious precedent gap is dominating the map right now.",
      nodes: topNodesBy(
        activeNodes,
        (node) => Math.max(node.scores?.novelty ?? 0, 1 - (node.psychology?.falsificationCoverageScore ?? 1)),
        (node) => (node.scores?.novelty ?? 0) > 0.45 || (node.psychology?.falsificationCoverageScore ?? 1) < 0.55,
      ),
    },
  ];
  const namedVoices = [
    {
      label: "Skeptical investor",
      attack: "What has to be true for this to return outsized value, and where is the hidden burn?",
      attackStyle: "Looks for leverage, downside asymmetry, and the first broken business assumption.",
    },
    {
      label: "Thesis committee",
      attack: "What is the exact claim, what is the counterclaim, and where is the evidence chain weak?",
      attackStyle: "Presses for method, scope control, and defensible structure.",
    },
    {
      label: "Skeptical academic",
      attack: "What would a rigorous reviewer say is under-defined, unsupported, or non-generalizable?",
      attackStyle: "Challenges causality, definitions, and hidden leaps.",
    },
    {
      label: "GTM operator",
      attack: "What changes in the field, the customer workflow, or the sale if this is actually true?",
      attackStyle: "Tests distribution, adoption friction, and operational reality.",
    },
  ];
  const loadBearingAssumption = map.graphSnapshot?.criticalDependencyIds
    .map((nodeId) => nodesById.get(nodeId) ?? null)
    .find((node): node is ThoughtNodeModel => node != null) ?? null;
  const challengedActions = Array.from(
    new Set(
      map.nodes
        .map((node) => node.actionOrigin)
        .filter((action): action is NonNullable<ThoughtNodeModel["actionOrigin"]> => action != null),
    ),
  );
  const activeBiasDetectors = Array.from(new Set(map.interventions.map((intervention) => intervention.detector)));
  const weakestLearningNode =
    (map.graphSnapshot?.weakestNodeIds ?? [])
      .map((nodeId) => nodesById.get(nodeId) ?? null)
      .find((node): node is ThoughtNodeModel => node != null) ?? null;
  const missingLearningKinds = map.graphSnapshot?.missingNodeTypes.slice(0, 3) ?? [];
  const learningPrompts = [
    ...(weakestLearningNode
      ? [
          {
            label: "Learn next",
            title: `Understand why this ${kindLabel(weakestLearningNode.kind)} is still weak.`,
            body: weakestLearningNode.content,
            helper:
              weakestLearningNode.note ??
              "Study what evidence, specificity, or counterweight would make this branch hold up under pressure.",
          },
        ]
      : []),
    ...(missingLearningKinds.length
      ? [
          {
            label: "Fill the gap",
            title: `Add missing ${missingLearningKinds.map(kindLabel).join(", ")} coverage.`,
            body: "The map still lacks enough contrast across the key branch types Penny uses to judge quality.",
            helper: "Learning here means adding the missing branch type, not just reading more broadly.",
          },
        ]
      : []),
    ...(map.recommendedNextMove
      ? [
          {
            label: "Validate next",
            title: map.recommendedNextMove.headline,
            body: map.recommendedNextMove.targetNodeContent,
            helper: map.recommendedNextMove.explanation,
          },
        ]
      : []),
  ];
  const learningLoopSteps = [
    "Capture the rough note.",
    "Stress-test the weak branch.",
    "Learn what the weakest gap is actually asking for.",
    "Turn that learning into the next validation move.",
  ];
  const validationPreview = map.founderBrief?.nextValidationSteps.slice(0, 2) ?? [];
  const graphCanvas = useMemo(() => {
    const sortedNodes = [...map.nodes].sort(
      (a, b) => a.branchOrder - b.branchOrder || a.createdAt.getTime() - b.createdAt.getTime(),
    );
    const depthById = new Map<string, number>();
    const positionedColumns: ThoughtNodeModel[][] = [];
    const seen = new Set<string>();

    function placeNode(node: ThoughtNodeModel, depth: number) {
      if (seen.has(node.id)) {
        return;
      }

      seen.add(node.id);
      depthById.set(node.id, depth);
      positionedColumns[depth] ??= [];
      positionedColumns[depth].push(node);

      for (const child of nodesByParent[node.id] ?? []) {
        placeNode(child, depth + 1);
      }
    }

    if (rootNode) {
      placeNode(rootNode, 0);
    }

    for (const node of sortedNodes) {
      if (seen.has(node.id)) {
        continue;
      }

      const parentDepth = node.parentId ? depthById.get(node.parentId) ?? 0 : 0;
      placeNode(node, node.parentId ? parentDepth + 1 : 0);
    }

    const columns = positionedColumns.filter(Boolean);
    const maxRows = Math.max(...columns.map((column) => column.length), 1);
    const weakestNodeIds = new Set(map.graphSnapshot?.weakestNodeIds ?? []);
    const criticalDependencyIds = new Set(map.graphSnapshot?.criticalDependencyIds ?? []);
    const positions = new Map<string, { x: number; y: number; depth: number }>();

    columns.forEach((column, depth) => {
      const offset = ((maxRows - column.length) * GRAPH_ROW_GAP) / 2;

      column.forEach((node, index) => {
        positions.set(node.id, {
          depth,
          x: GRAPH_PADDING_X + depth * GRAPH_COLUMN_GAP,
          y: GRAPH_PADDING_Y + offset + index * GRAPH_ROW_GAP,
        });
      });
    });

    const maxDepth = Math.max(columns.length - 1, 0);
    const width = Math.max(720, GRAPH_PADDING_X * 2 + maxDepth * GRAPH_COLUMN_GAP + GRAPH_NODE_WIDTH);
    const height = Math.max(400, GRAPH_PADDING_Y * 2 + (maxRows - 1) * GRAPH_ROW_GAP + GRAPH_NODE_HEIGHT);
    const nodes: PositionedGraphNode[] = sortedNodes.flatMap((node) => {
      const position = positions.get(node.id);

      if (!position) {
        return [];
      }

      return [
        {
          node,
          depth: position.depth,
          x: position.x,
          y: position.y,
          isWeak: weakestNodeIds.has(node.id),
          isCritical: criticalDependencyIds.has(node.id),
          childCount: (nodesByParent[node.id] ?? []).length,
        },
      ];
    });
    const edges = sortedNodes.flatMap((node) => {
      if (!node.parentId) {
        return [];
      }

      const from = positions.get(node.parentId);
      const to = positions.get(node.id);

      if (!from || !to) {
        return [];
      }

      return [
        {
          id: `${node.parentId}-${node.id}`,
          parentId: node.parentId,
          childId: node.id,
          from,
          to,
          isWeak: weakestNodeIds.has(node.id),
          isCritical: criticalDependencyIds.has(node.id),
        },
      ];
    });

    return {
      width,
      height,
      nodes,
      edges,
    };
  }, [map.graphSnapshot, map.nodes, nodesByParent, rootNode]);

  useEffect(() => {
    if (!selectedGraphNodeId || !nodesById.has(selectedGraphNodeId)) {
      setSelectedGraphNodeId(defaultGraphNodeId);
    }
  }, [defaultGraphNodeId, nodesById, selectedGraphNodeId]);

  const selectedGraphNode =
    graphCanvas.nodes.find((candidate) => candidate.node.id === selectedGraphNodeId) ?? null;
  const selectedGraphNodeModel = selectedGraphNode?.node ?? null;
  const activeShapeCallout = useMemo(
    () => findActiveShapeCallout(selectedGraphNodeModel, derivedShapes),
    [derivedShapes, selectedGraphNodeModel],
  );
  const selectedGenealogy = useMemo(
    () => buildBeliefGenealogy(map.nodes, selectedGraphNode?.node.id ?? defaultGraphNodeId ?? rootNode?.id ?? ""),
    [defaultGraphNodeId, map.nodes, rootNode?.id, selectedGraphNode?.node.id],
  );
  const selectedOldSelves = useMemo(
    () => buildOldSelfTimeline(map.nodes, map.events, selectedGraphNode?.node.id ?? defaultGraphNodeId ?? rootNode?.id ?? ""),
    [defaultGraphNodeId, map.events, map.nodes, rootNode?.id, selectedGraphNode?.node.id],
  );
  const selectedMoveHistory = useMemo(
    () => buildClaimMoveHistory(map.nodes, map.events, selectedGraphNode?.node.id ?? defaultGraphNodeId ?? rootNode?.id ?? ""),
    [defaultGraphNodeId, map.events, map.nodes, rootNode?.id, selectedGraphNode?.node.id],
  );
  const selectedReceiptVoices = useMemo(
    () => buildDevilsAdvocateReceipts(selectedGraphNodeModel),
    [selectedGraphNodeModel],
  );
  const selectedGraphNodeParent = selectedGraphNode?.node.parentId
    ? nodesById.get(selectedGraphNode.node.parentId) ?? null
    : null;
  const selectedPrecedents = selectedGraphNode ? retrievePrecedentsForNode(selectedGraphNode.node) : [];
  const selectedDecay = selectedGraphNode
    ? buildConfidenceDecaySnapshot(selectedGraphNode.node, selectedGenealogy.dependents.length)
    : null;
  const selectedCascade = useMemo(
    () => traceContradictionCascade(map.nodes, selectedGraphNode?.node.id ?? defaultGraphNodeId ?? rootNode?.id ?? ""),
    [defaultGraphNodeId, map.nodes, rootNode?.id, selectedGraphNode?.node.id],
  );
  const interleavedStressQueue = useMemo(() => interleaveStressNodes(activeNodes).slice(0, 8), [activeNodes]);
  const claimCapture = useMemo(() => captureSnapshotForMap(map), [map]);
  const rhythm = useMemo(() => buildSessionRhythmSnapshot(map), [map]);
  const bestSteelmanTarget = map.recommendedNextMove
    ? map.nodes.find((node) => node.id === map.recommendedNextMove?.targetNodeId) ?? null
    : selectedGraphNode?.node ?? weakestLearningNode ?? map.nodes.find((node) => node.kind === "core_claim") ?? rootNode ?? null;
  const steelmanTargetText = bestSteelmanTarget?.content ?? map.rawThought;
  const steelmanPrompt = `Argue the strongest possible version of this position: ${steelmanTargetText}`;
  const selectedNormChallengeNode =
    selectedGraphNode?.node ?? map.nodes.find((node) => /norm|should|must|rule/i.test(node.content)) ?? null;
  const selectedPrecedentSummary =
    selectedPrecedents[0] ?? null;
  const inspectorScores = selectedGraphNode
    ? [
        { label: "Strength", value: selectedGraphNode.node.scores?.strength ?? null },
        { label: "Evidence", value: selectedGraphNode.node.scores?.evidence ?? null },
        { label: "Specificity", value: selectedGraphNode.node.scores?.specificity ?? null },
        { label: "Dependency risk", value: selectedGraphNode.node.scores?.dependencyRisk ?? null },
      ]
    : [];

  function mergeMapUpdate(response: ActionResponse) {
    const updatedNodes = response.updatedNodes.map(normalizeNode);
    const createdNodes = response.createdNodes.map(normalizeNode);
    const normalizedInterventions = response.interventions?.map(normalizeIntervention);
    const normalizedRecommendedIntervention = response.recommendedIntervention
      ? normalizeIntervention(response.recommendedIntervention)
      : response.recommendedIntervention === null
        ? null
        : undefined;
    const syntheticMoveEvent: SerializableThoughtMapEvent = {
      id: `local:${response.action}:${response.execution.targetNodeId}:${Date.now()}`,
      mapId: map.id,
      nodeId: response.execution.targetNodeId,
      interventionId: null,
      eventType: "move_applied",
      payload: {
        action: response.action,
        executionMode: response.execution.mode,
        targetNodeKind: response.execution.targetNodeKind,
        targetParentId: response.execution.targetParentId,
        supersededNodeId: response.execution.supersededNodeId,
        createdNodeIds: response.createdNodes.map((node) => node.id),
        updatedNodeIds: response.updatedNodes.map((node) => node.id),
      },
      createdAt: new Date(),
    };

    setMap((currentMap) => {
      const updatedLookup = new Map(updatedNodes.map((node) => [node.id, node]));
      const baseNodes = currentMap.nodes.map((node) => updatedLookup.get(node.id) ?? node);
      const deduped = new Map(baseNodes.map((node) => [node.id, node]));

      for (const node of createdNodes) {
        deduped.set(node.id, node);
      }

      return {
        ...currentMap,
        nodes: Array.from(deduped.values()).sort(
          (a, b) => a.branchOrder - b.branchOrder || a.createdAt.getTime() - b.createdAt.getTime(),
        ),
        graphSnapshot: response.graphSnapshot ?? currentMap.graphSnapshot,
        interventions: normalizedInterventions ?? currentMap.interventions,
        recommendedIntervention:
          normalizedRecommendedIntervention === undefined
            ? currentMap.recommendedIntervention
            : normalizedRecommendedIntervention,
        recommendedNextMove: response.recommendedNextMove ?? currentMap.recommendedNextMove,
        events: [...currentMap.events, normalizeEvent(syntheticMoveEvent)].sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
        ),
        updatedAt: new Date(),
      };
    });
  }

  function mergeShapeFeedbackEvent(event: SerializableThoughtMapEvent) {
    const normalizedEvent = normalizeEvent(event);

    setMap((currentMap) => ({
      ...currentMap,
      events: [...currentMap.events, normalizedEvent].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      ),
      updatedAt: new Date(),
    }));
  }

  function recordShapeFeedback(shape: { id: string; label: string; primaryMapId: string | null }, verdict: PennyShapeFeedback) {
    const mapId = shape.primaryMapId ?? map.id;
    const previousVerdict = shapeFeedback[shape.id];
    const restoreFeedback = () =>
      setShapeFeedback((current) => {
        const next = { ...current };

        if (previousVerdict) {
          next[shape.id] = previousVerdict;
        } else {
          delete next[shape.id];
        }

        return next;
      });

    setShapeFeedback((current) => ({ ...current, [shape.id]: verdict }));

    startTransition(async () => {
      try {
        const response = await fetch(`/api/maps/${mapId}/shape-feedback`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            shapeId: shape.id,
            verdict,
            shapeLabel: shape.label,
            source: "workspace",
            nodeId: selectedGraphNode?.node.id ?? selectedGraphNodeModel?.id ?? null,
          }),
        });

        if (!response.ok) {
          restoreFeedback();
          return;
        }

        const payload = (await response.json()) as { event: SerializableThoughtMapEvent };
        mergeShapeFeedbackEvent(payload.event);
      } catch {
        restoreFeedback();
        return;
      }
    });
  }

  function runAction(nodeId: string, action: (typeof ACTIONS)[number]["key"]) {
    setActiveNodeId(nodeId);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/maps/${map.id}/nodes/${nodeId}/actions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action }),
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as ActionResponse;
        setLastAction(payload);
        mergeMapUpdate(payload);
      } catch {
        return;
      } finally {
        setActiveNodeId(null);
      }
    });
  }

  function runRecommendedNextMove() {
    if (!map.recommendedNextMove) {
      return;
    }

    setRunningRecommendedMove(true);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/maps/${map.id}/recommended-next-move`, {
          method: "POST",
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as ActionResponse;
        setLastAction(payload);
        mergeMapUpdate(payload);
      } catch {
        return;
      } finally {
        setRunningRecommendedMove(false);
      }
    });
  }

  function founderBriefReadinessMessage() {
    if (map.founderBriefReadiness.eligible) {
      return "Ready to generate. The map has at least one active assumption, counterargument, and research branch.";
    }

    const missing = map.founderBriefReadiness.missingRequirements.map((requirement) =>
      requirement.replaceAll("_", " "),
    );

    return `Add at least one active ${missing.join(", ")} branch before generating the founder brief.`;
  }

  function runFounderBrief() {
    setFounderBriefError(null);
    setRunningFounderBrief(true);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/maps/${map.id}/founder-brief`, {
          method: "POST",
        });

        if (!response.ok) {
          setFounderBriefError(
            response.status === 409 ? founderBriefReadinessMessage() : "Penny could not generate the founder brief.",
          );
          return;
        }

        const payload = (await response.json()) as FounderBriefResponse;
        setMap(normalizeMap(payload.map));
      } catch {
        setFounderBriefError("Penny could not generate the founder brief.");
      } finally {
        setRunningFounderBrief(false);
      }
    });
  }

  function visibleActions(node: ThoughtNodeModel) {
    if (map.recommendedIntervention?.type !== "reduce_choices" || map.recommendedIntervention.targetNodeId !== node.id) {
      return ACTIONS;
    }

    const preferred = map.recommendedNextMove?.action;
    const ordered = [
      ...(preferred ? ACTIONS.filter((action) => action.key === preferred) : []),
      ...ACTIONS.filter((action) => action.key !== preferred),
    ];

    return ordered.slice(0, 3);
  }

  function changeView(nextView: MapView) {
    setView(nextView);

    if (nextView === "graph" && !selectedGraphNodeId) {
      setSelectedGraphNodeId(defaultGraphNodeId);
    }
  }

  function renderNode(node: ThoughtNodeModel, depth = 0): React.ReactNode {
    const children = nodesByParent[node.id] ?? [];
    const supersededNode =
      node.supersedesNodeId ? map.nodes.find((candidate) => candidate.id === node.supersedesNodeId) : null;

    return (
      <div key={node.id} className={depth > 0 ? "pl-4 sm:pl-6" : ""}>
        <div className={`rounded-[24px] border p-4 shadow-[0_12px_32px_rgba(15,23,42,0.05)] ${statusTone(node.nodeStatus)}`}>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={statusBadge(node.nodeStatus)}>{node.nodeStatus}</Badge>
            <Badge>{kindLabel(node.kind)}</Badge>
            {node.supersedesNodeId ? <Badge className="bg-[#e7defa] text-[#5c4c88]">replacement</Badge> : null}
          </div>

          <p className="mt-3 text-sm leading-7 text-[var(--ink)] sm:text-base">{node.content}</p>

          {node.note ? <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{node.note}</p> : null}

          {supersededNode ? (
            <p className="mt-3 text-xs leading-6 text-[var(--muted-ink)]">
              Replaces: <span className="font-medium text-[var(--ink)]">{supersededNode.content}</span>
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            {visibleActions(node).map((action) => (
              <Button
                key={action.key}
                variant="secondary"
                className="gap-2 px-3 py-2 text-xs"
                disabled={isPending && activeNodeId === node.id}
                onClick={() => runAction(node.id, action.key)}
              >
                <action.icon className="size-3.5" />
                {action.label}
              </Button>
            ))}
          </div>
        </div>

        {children.length ? (
          <div className="mt-4 space-y-4">
            {children.map((child) => renderNode(child, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  }

  if (!rootNode) {
    return null;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Thought Map</p>
          <h1 className="mt-2 max-w-4xl text-4xl font-semibold text-[var(--ink)]">{map.title}</h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--muted-ink)]">
            A personal thinking wiki for founders: keep the source thought visible, tighten weak branches, and use the next move to keep momentum.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Badge className="bg-[#d9ead8] text-[#355b32]">Active {statusCounts.active}</Badge>
          <Badge className="bg-[#f5d6b3] text-[#8b4d1f]">Weak {statusCounts.weak}</Badge>
          <Badge className="bg-black/8 text-[var(--muted-ink)]">Superseded {statusCounts.superseded}</Badge>
        </div>
      </div>

      <Card className="p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Best next move</Badge>
              {map.recommendedNextMove ? (
                <>
                  <Badge className="bg-[#e7defa] text-[#5c4c88]">{map.recommendedNextMove.action.replaceAll("_", " ")}</Badge>
                  <Badge>{map.recommendedNextMove.targetNodeKind.replaceAll("_", " ")}</Badge>
                </>
              ) : (
                <Badge className="bg-[var(--panel)] text-[var(--ink)]">Needs more map structure</Badge>
              )}
            </div>
            <h2 className="mt-4 text-3xl font-semibold text-[var(--ink)]">
              {map.recommendedNextMove?.headline ?? "Keep shaping the map until Penny can point to one decisive next move."}
            </h2>
            <p className="mt-3 text-base leading-7 text-[var(--muted-ink)]">
              {map.recommendedNextMove?.explanation ??
                "The map is still gathering enough structure to decide what to do next. Add clearer branches, stronger contrast, or more evidence so Penny can recommend the next action."}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            {unresolvedGaps.slice(0, 4).map((gap) => (
              <Badge key={`next-gap-${gap}`} className="bg-[var(--panel)] text-[var(--ink)]">
                {gap}
              </Badge>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="grid gap-4">
            <div className="rounded-[24px] bg-[var(--panel)] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Target branch</p>
              <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
                {map.recommendedNextMove?.targetNodeContent ?? map.rawThought}
              </p>
              <div className="mt-4 space-y-2">
                {map.recommendedNextMove?.reasoning.why.slice(0, 2).map((reason) => (
                  <p key={reason} className="text-sm leading-6 text-[var(--muted-ink)]">
                    {reason}
                  </p>
                ))}
                {map.recommendedIntervention ? (
                  <p className="text-sm leading-6 text-[var(--muted-ink)]">
                    Intervention: <span className="font-medium text-[var(--ink)]">{map.recommendedIntervention.type.replaceAll("_", " ")}</span>{" "}
                    because {map.recommendedIntervention.triggerReason.toLowerCase()}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {learningPrompts.length ? (
                learningPrompts.slice(0, 2).map((prompt) => (
                  <div key={prompt.label + prompt.title} className="rounded-[24px] border border-black/8 bg-white p-5">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">{prompt.label}</p>
                    <h3 className="mt-2 text-lg font-semibold text-[var(--ink)]">{prompt.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-[var(--ink)]">{prompt.body}</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{prompt.helper}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-[24px] border border-black/8 bg-white p-5 lg:col-span-2">
                  <p className="text-sm leading-6 text-[var(--muted-ink)]">
                    Keep building the map. Once Penny can see a weak branch or missing branch type, this section will tell you what to learn next, which precedent to compare against, and what to validate after that.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[24px] border border-black/8 bg-white p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Operating loop</p>
            <div className="mt-4 space-y-3">
              {learningLoopSteps.map((step, index) => (
                <div key={step} className="rounded-[20px] bg-[var(--panel)] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Step {index + 1}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{step}</p>
                </div>
              ))}
            </div>

            {validationPreview.length ? (
              <>
                <p className="mt-5 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Validation path</p>
                <div className="mt-3 space-y-2">
                  {validationPreview.map((step) => (
                    <p key={step} className="text-sm leading-6 text-[var(--muted-ink)]">
                      {step}
                    </p>
                  ))}
                </div>
              </>
            ) : null}

            <p className="mt-5 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Steel-manning gym</p>
            <div className="mt-3 rounded-[20px] bg-[var(--panel)] p-4">
              <p className="text-sm leading-6 text-[var(--ink)]">{steelmanPrompt}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                Practice mode: argue the strongest version of a position you disagree with, then compare your version to Penny’s best version.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge className="bg-white text-[var(--ink)]">Scored against Penny’s best version</Badge>
                {bestSteelmanTarget ? <Badge className="bg-white text-[var(--ink)]">{kindLabel(bestSteelmanTarget.kind)}</Badge> : null}
              </div>
            </div>

            <div className="mt-5">
              <Button
                className="gap-2"
                disabled={!map.recommendedNextMove || runningRecommendedMove || isPending}
                onClick={runRecommendedNextMove}
              >
                <Sparkles className="size-4" />
                {map.recommendedNextMove ? "Do the best next move" : "Best next move pending"}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Source entry</p>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--ink)]">The original wiki note stays in view.</h2>
            <p className="mt-3 text-sm leading-7 text-[var(--ink)]">{map.rawThought}</p>
            <p className="mt-4 text-sm leading-6 text-[var(--muted-ink)]">
              Penny turns that entry into claims, assumptions, counterarguments, research paths, and decision support without losing the original thought that started the map.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-[24px] bg-[var(--panel)] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Unresolved gaps</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {unresolvedGaps.length ? (
                  unresolvedGaps.slice(0, 4).map((gap) => (
                    <Badge key={gap} className="bg-white text-[var(--ink)]">
                      {gap}
                    </Badge>
                  ))
                ) : (
                  <Badge className="bg-white text-[var(--ink)]">No major gap flags yet</Badge>
                )}
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
                Weak branches, dependency pressure, and missing map coverage stay visible so the note keeps getting sharpened instead of archived.
              </p>
            </div>

            <div className="rounded-[24px] bg-[var(--panel)] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Next action</p>
              <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
                {map.recommendedNextMove?.headline ?? "Keep building the map until Penny can recommend the next move."}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                {map.recommendedNextMove?.explanation ??
                  "The next move card below will become the operating loop once the map has enough structure to judge."}
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Weak-node triage</p>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Push the weakest branches first, then widen to the rest of the map.</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted-ink)]">
              Penny now treats triage as a visible lane on the workspace: weak evidence, contradictions, risky dependencies, and missing comparisons are prioritized before they become a bigger repair job.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {challengedActions.length ? (
              challengedActions.map((action) => (
                <Badge key={action} className="bg-[var(--panel)] text-[var(--ink)]">
                  challenged via {labelAction(action)}
                </Badge>
              ))
            ) : (
              <Badge className="bg-[var(--panel)] text-[var(--ink)]">No prior challenge actions yet</Badge>
            )}
            {activeBiasDetectors.map((detector) => (
              <Badge key={detector} className="bg-[#fff6ed] text-[#8b4d1f]">
                override signal {labelBias(detector)}
              </Badge>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {frameworkCritiques.map((framework) => (
            <div key={framework.label} className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">{framework.label}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{framework.focus}</p>
              <div className="mt-4 space-y-3">
                {framework.nodes.length ? (
                  framework.nodes.slice(0, 3).map((node) => (
                    <div key={`${framework.label}-${node.id}`} className="rounded-[20px] bg-white p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={statusBadge(node.nodeStatus)}>{node.nodeStatus}</Badge>
                        <Badge>{kindLabel(node.kind)}</Badge>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{node.content}</p>
                      <p className="mt-2 text-xs leading-5 text-[var(--muted-ink)]">
                        {node.psychology?.likelyBiases.length
                          ? `Lens pressure: ${node.psychology.likelyBiases.map(labelBias).join(" · ")}`
                          : framework.label === "Historical"
                            ? "Search for precedent before shipping the claim."
                            : framework.label === "Game theory"
                              ? "Trace who benefits, who reacts, and where incentives break."
                              : framework.label === "Network effects"
                                ? "Check whether adoption compounds or stalls at the edge."
                                : framework.label === "Operational"
                                  ? "Find the handoff or process step most likely to fail."
                                  : framework.label === "Psychological"
                                    ? "Ask what bias or self-protection is steering the answer."
                                    : "Identify the coalition or resistance pressure first."}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="rounded-[20px] bg-white p-4 text-sm leading-6 text-[var(--muted-ink)]">{framework.empty}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {namedVoices.map((voice) => (
            <div key={voice.label} className="rounded-[24px] border border-black/8 bg-white p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">{voice.label}</p>
              <p className="mt-3 text-sm leading-7 text-[var(--ink)]">{voice.attack}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{voice.attackStyle}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-[24px] border border-black/8 bg-white p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Devil&apos;s advocate with receipts</p>
          <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">Critique the claim through thinkers who already warned about this shape.</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
            Penny picks a thinker whose position matches the failure mode, then attaches a precedent showing what happened when people took the optimistic side anyway.
          </p>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {selectedReceiptVoices.length ? (
              selectedReceiptVoices.map((receipt) => (
                <div key={receipt.thinker} className="rounded-[18px] bg-[var(--panel)] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-white text-[var(--ink)]">{receipt.thinker}</Badge>
                    <Badge className="bg-[#e7defa] text-[#5c4c88]">receipt-backed</Badge>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{receipt.position}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{receipt.precedent}</p>
                  <p className="mt-2 text-xs leading-5 text-[var(--muted-ink)]">{receipt.lesson}</p>
                </div>
              ))
            ) : (
              <p className="rounded-[18px] bg-[var(--panel)] p-4 text-sm leading-6 text-[var(--muted-ink)]">
                Select a claim to see which historical thinkers would attack it with receipts.
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Peer simulation</p>
              <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">Critique this claim as a named audience</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                Penny uses how this audience historically attacks similar structures, then grounds the response in the matching precedent set.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["skeptical investor", "thesis advisor", "skeptical academic", "gtm operator"] as PeerAudience[]).map((audience) => (
                <Button
                  key={audience}
                  variant={peerAudience === audience ? "primary" : "secondary"}
                  className="px-4 py-2 text-xs"
                  onClick={() => setPeerAudience(audience)}
                >
                  {audience}
                </Button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
            <div className="rounded-[20px] bg-white p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Precedent-grounded critique</p>
              <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
                {selectedGraphNode
                  ? `${peerAudience} mode: Penny searches for failure cases that match this claim’s risk profile before it gives the critique.`
                  : "Select a claim to retrieve failure cases that match its risk profile."}
              </p>
              {selectedPrecedents.length ? (
                <div className="mt-4 space-y-3">
                  {selectedPrecedents.map((precedent) => (
                    <div key={precedent.id} className="rounded-[18px] bg-[var(--panel)] p-4">
                      <p className="text-sm font-medium text-[var(--ink)]">{precedent.name}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                        {precedent.domain} · {precedent.failureMode}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {precedent.riskTags.map((tag) => (
                          <Badge key={`${precedent.id}-${tag}`} className="bg-white text-[var(--ink)]">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                      <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{precedent.whatKilledIt}</p>
                      <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{precedent.killAssumption}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm leading-6 text-[var(--muted-ink)]">
                  Penny will show the cases that most closely match the claim’s risk profile once a node is selected.
                </p>
              )}
            </div>

            <div className="rounded-[20px] bg-white p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Audience attacks</p>
              <div className="mt-3 space-y-2">
                {(selectedPrecedentSummary?.audienceAttacks ?? [])[0] ? (
                  selectedPrecedentSummary!.audienceAttacks.map((attack) => (
                    <p key={attack} className="rounded-[16px] bg-[var(--panel)] px-4 py-3 text-sm leading-6 text-[var(--ink)]">
                      {attack}
                    </p>
                  ))
                ) : (
                  <p className="text-sm leading-6 text-[var(--muted-ink)]">
                    Choose an audience to simulate how that audience historically attacks similar structures.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-[20px] bg-white p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Norm-challenge scrutiny</p>
              {selectedNormChallengeNode ? (
                <>
                  <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
                    {selectedNormChallengeNode.content}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
                    Penny holds the strongest case for the norm in view, then checks whether the counter-case actually addresses the reason the norm exists.
                  </p>
                  <div className="mt-4 rounded-[18px] bg-[var(--panel)] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Why this norm exists</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--ink)]">
                      Norms usually exist because they protect trust, coordination, or safety. The scrutiny pass asks whether the objection also handles those load-bearing concerns.
                    </p>
                  </div>
                </>
              ) : (
                <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
                  No explicit norm claim is selected yet. Pick a claim that frames a rule, should, must, or policy to surface this scrutiny pass.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-[24px] border border-black/8 bg-white p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Interleaved stress-testing</p>
          <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">Alternate across related claims instead of drilling one branch at a time.</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
            Penny mixes weak-evidence, falsification, dependency, and comparison pressure so the critique discriminates between nearby claims instead of pattern-matching one branch to death.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {interleavedStressQueue.length ? (
              interleavedStressQueue.map((node, index) => (
                <div key={node.id} className="rounded-[18px] bg-[var(--panel)] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={statusBadge(node.nodeStatus)}>{node.nodeStatus}</Badge>
                    <Badge>{kindLabel(node.kind)}</Badge>
                    <Badge className="bg-white text-[var(--ink)]">pass {index + 1}</Badge>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{node.content}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                    {node.scores?.evidence != null ? `evidence ${formatScore(node.scores.evidence)}` : "evidence n/a"} ·{" "}
                    {node.psychology?.falsificationCoverageScore != null
                      ? `falsification ${formatScore(node.psychology.falsificationCoverageScore)}`
                      : "falsification n/a"}
                  </p>
                </div>
              ))
            ) : (
              <p className="rounded-[18px] bg-[var(--panel)] p-4 text-sm leading-6 text-[var(--muted-ink)]">
                No stress nodes yet. Add more claims so Penny can alternate pressure across the map.
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {stressTestPasses.map((pass) => (
            <div key={pass.title} className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">{pass.title}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{pass.description}</p>
              <div className="mt-4 space-y-3">
                {pass.nodes.length ? (
                  pass.nodes.map((node) => (
                    <div key={`${pass.title}-${node.id}`} className="rounded-[20px] bg-white p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={statusBadge(node.nodeStatus)}>{node.nodeStatus}</Badge>
                        <Badge>{kindLabel(node.kind)}</Badge>
                        <Badge className="bg-[var(--panel)] text-[var(--ink)]">{pass.metric(node)}</Badge>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{node.content}</p>
                      {node.psychology?.likelyBiases.length ? (
                        <p className="mt-2 text-xs leading-5 text-[var(--muted-ink)]">
                          Bias signals: {node.psychology.likelyBiases.map(labelBias).join(" · ")}
                        </p>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="rounded-[20px] bg-white p-4 text-sm leading-6 text-[var(--muted-ink)]">{pass.empty}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-[24px] bg-white p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Adversarial final pass</p>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
            Penny attacks the dependency structure before synthesis so it can find the quiet keystone that would collapse the output if it were wrong.
          </p>
          {loadBearingAssumption ? (
            <div className="mt-4 rounded-[20px] bg-[var(--panel)] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Load-bearing assumption</p>
              <p className="mt-2 text-sm leading-7 text-[var(--ink)]">{loadBearingAssumption.content}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                If this assumption fails, the map’s strongest branch loses its support. Are you sure this is the quiet keystone?
              </p>
            </div>
          ) : (
            <p className="mt-4 rounded-[20px] bg-[var(--panel)] p-4 text-sm leading-6 text-[var(--muted-ink)]">
              Keep building the map until Penny can identify the load-bearing assumption behind the output.
            </p>
          )}
          <p className="mt-4 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Override trail</p>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
            Already-challenged branches stay visible here so future pressure can go deeper instead of repeating the same surface critique.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {challengedActions.length ? (
              challengedActions.map((action) => (
                <Badge key={`history-${action}`} className="bg-[var(--panel)] text-[var(--ink)]">
                  {labelAction(action)}
                </Badge>
              ))
            ) : (
              <Badge className="bg-[var(--panel)] text-[var(--ink)]">No challenge history yet</Badge>
            )}
            {map.interventions.length ? (
              <Badge className="bg-[#fff6ed] text-[#8b4d1f]">{map.interventions.length} active intervention prompts</Badge>
            ) : null}
          </div>
        </div>
      </Card>

      {lastAction?.reasoning.graphAnalysis ? (
        <Card className="p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Last move</Badge>
            <Badge className="bg-[#e7defa] text-[#5c4c88]">{lastAction.execution.mode.replaceAll("_", " ")}</Badge>
            <Badge>{lastAction.reasoning.graphAnalysis.primaryGap.replaceAll("-", " ")}</Badge>
          </div>
          <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
            Penny targeted <span className="font-medium">{lastAction.execution.targetNodeKind.replaceAll("_", " ")}</span> because the graph’s weakest gap was{" "}
            <span className="font-medium">{lastAction.reasoning.graphAnalysis.primaryGap.replaceAll("-", " ")}</span>.
          </p>
          <div className="mt-4 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Why this move</p>
              <div className="mt-2 space-y-2">
                {lastAction.reasoning.graphAnalysis.actionSelection.why.map((reason) => (
                  <p key={reason} className="text-sm leading-6 text-[var(--ink)]">
                    {reason}
                  </p>
                ))}
                {lastAction.reasoning.graphAnalysis.reasons.map((reason) => (
                  <p key={reason} className="text-sm leading-6 text-[var(--muted-ink)]">
                    {reason}
                  </p>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Weak branches</p>
              <div className="mt-2 space-y-3">
                {lastAction.reasoning.graphAnalysis.weakNodes.slice(0, 3).map((node) => (
                  <div key={node.nodeId} className="rounded-[20px] bg-[var(--panel)] p-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                      {node.kind.replaceAll("_", " ")} · score {node.score}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--ink)]">{node.content}</p>
                    <p className="mt-2 text-xs leading-5 text-[var(--muted-ink)]">{node.issues.join(" · ")}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Memory layer</p>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Old selves, belief genealogy, and shape feedback.</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted-ink)]">
              Penny turns the move history into something you can actually feel: how a claim changed, what depended on it, and which thinking pattern is active in the current critique.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {derivedShapes.slice(0, 3).map((shape) => (
              <Badge key={shape.id} className="bg-[var(--panel)] text-[var(--ink)]">
                {shape.label}
              </Badge>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Old selves</p>
                <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">Timeline of this claim</h3>
              </div>
              <Badge className="bg-white text-[var(--ink)]">{selectedOldSelves.length} versions</Badge>
            </div>

            <div className="mt-4 space-y-3">
              {selectedOldSelves.map((snapshot) => (
                <div key={snapshot.id} className={cn("rounded-[20px] bg-white p-4", snapshot.isCurrent && "ring-2 ring-[var(--ink)] ring-offset-1")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-[var(--panel)] text-[var(--ink)]">{snapshot.versionLabel}</Badge>
                    <Badge className={statusBadge(snapshot.status)}>{snapshot.status}</Badge>
                    {snapshot.confidence != null ? (
                      <Badge className="bg-[#d9ead8] text-[#355b32]">confidence {formatScore(snapshot.confidence)}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{snapshot.content}</p>
                  {snapshot.note ? <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{snapshot.note}</p> : null}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge className="bg-[#e7defa] text-[#5c4c88]">{snapshot.moveLabel}</Badge>
                    <span className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">{snapshot.updatedAt.toLocaleDateString()}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{snapshot.moveSummary}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[24px] border border-black/8 bg-white p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Inheritance claims</p>
              <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">How this belief entered the map</h3>
              {claimCapture ? (
                <>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Badge className="bg-[var(--panel)] text-[var(--ink)]">{claimCapture.provenance}</Badge>
                    <Badge className="bg-[#e7defa] text-[#5c4c88]">confidence {claimCapture.confidence}%</Badge>
                    <Badge className="bg-[#d9ead8] text-[#355b32]">{claimCapture.status}</Badge>
                    {claimCapture.resolutionDate ? (
                      <Badge className="bg-[#fff6ed] text-[#8b4d1f]">{claimCapture.resolutionDate}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--ink)]">
                    {claimCapture.provenance === "inherited"
                      ? `Inherited from ${claimCapture.provenanceDetail || "another person"}.`
                      : "This claim started from your own capture instead of a source you inherited."}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                    {claimCapture.provenance === "inherited"
                      ? "Scrutiny automatically goes up on the source chain because inherited beliefs can hide borrowed errors."
                      : "Penny still records provenance so later revisions can trace where the belief came from."}
                  </p>
                </>
              ) : (
                <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
                  No capture metadata is available for this map yet.
                </p>
              )}
            </div>

            <div className="rounded-[24px] border border-black/8 bg-white p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Belief genealogy</p>
              <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">Supersession chain and source contradictions</h3>

              {selectedGenealogy.lineage.length ? (
                <div className="mt-4 space-y-3">
                  {selectedGenealogy.lineage.map((node, index) => (
                    <div key={node.id} className="rounded-[18px] bg-[var(--panel)] p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={statusBadge(node.nodeStatus)}>{node.nodeStatus}</Badge>
                        <Badge>{kindLabel(node.kind)}</Badge>
                        {index === selectedGenealogy.lineage.length - 1 ? (
                          <Badge className="bg-[#d9ead8] text-[#355b32]">current source</Badge>
                        ) : (
                          <Badge className="bg-[#e7defa] text-[#5c4c88]">ancestor</Badge>
                        )}
                      </div>
                      <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{node.content}</p>
                      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                        {node.scores?.confidence != null ? `Confidence ${formatScore(node.scores.confidence)}` : "No confidence score"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm leading-6 text-[var(--muted-ink)]">No genealogy available for the current selection.</p>
              )}

              <div className="mt-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Downstream claims</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedGenealogy.dependents.length ? (
                    selectedGenealogy.dependents.slice(0, 4).map((node) => (
                      <Badge key={node.id} className="bg-[var(--panel)] text-[var(--ink)]">
                        {kindLabel(node.kind)} · {node.nodeStatus}
                      </Badge>
                    ))
                  ) : (
                    <Badge className="bg-[var(--panel)] text-[var(--ink)]">No direct dependents yet</Badge>
                  )}
                </div>
              </div>

              <div className="mt-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Contradicted by</p>
                <div className="mt-3 space-y-2">
                  {selectedGenealogy.contradictions.length ? (
                    selectedGenealogy.contradictions.slice(0, 4).map((node) => (
                      <div key={node.id} className="rounded-[18px] bg-[var(--panel)] p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={statusBadge(node.nodeStatus)}>{node.nodeStatus}</Badge>
                          <Badge>{kindLabel(node.kind)}</Badge>
                          {node.nodeStatus === "superseded" ? (
                            <Badge className="bg-[#f5d6b3] text-[#8b4d1f]">source contradicted</Badge>
                          ) : null}
                        </div>
                        <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{node.content}</p>
                      </div>
                    ))
                  ) : (
                    <Badge className="bg-[var(--panel)] text-[var(--ink)]">No contradicted source found yet</Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-black/8 bg-white p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Move history</p>
              <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">What happened to this claim</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                The move log makes the self-iteration visible: what Penny changed, what signals fired, and when the user pushed back.
              </p>
              <div className="mt-4 space-y-3">
                {selectedMoveHistory.length ? (
                  selectedMoveHistory.slice(-5).map((entry) => (
                    <div key={entry.id} className="rounded-[18px] bg-[var(--panel)] p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="bg-white text-[var(--ink)]">{entry.label}</Badge>
                        <Badge
                          className={
                            entry.accent === "move"
                              ? "bg-[#d9ead8] text-[#355b32]"
                              : entry.accent === "feedback"
                                ? "bg-[#e7defa] text-[#5c4c88]"
                                : "bg-[#fff6ed] text-[#8b4d1f]"
                          }
                        >
                          {entry.accent}
                        </Badge>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{entry.summary}</p>
                      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                        {entry.createdAt.toLocaleDateString()}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="rounded-[18px] bg-[var(--panel)] p-4 text-sm leading-6 text-[var(--muted-ink)]">
                    No move history yet for this claim.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-[24px] border border-black/8 bg-[linear-gradient(180deg,#fffdf8_0%,#f8f2e8_100%)] p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Shape callout</p>
              <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">
                {activeShapeCallout ? activeShapeCallout.label : "No active shape"}
              </h3>

              {activeShapeCallout ? (
                <>
                  <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{activeShapeCallout.summary}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{activeShapeCallout.explanation}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Badge className="bg-white text-[var(--ink)]">
                      {formatShapeVerdict(activeShapeCallout.verdict)} · {activeShapeCallout.confidence}%
                    </Badge>
                    <Badge className="bg-[#e7defa] text-[#5c4c88]">
                      {activeShapeCallout.evidenceNodeIds.length} prior claim
                      {activeShapeCallout.evidenceNodeIds.length === 1 ? "" : "s"}
                    </Badge>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      className="px-3 py-2 text-xs"
                      onClick={() => recordShapeFeedback(activeShapeCallout, "confirmed")}
                    >
                      Confirm
                    </Button>
                    <Button
                      variant="secondary"
                      className="px-3 py-2 text-xs"
                      onClick={() => recordShapeFeedback(activeShapeCallout, "rejected")}
                    >
                      Reject
                    </Button>
                    <Button
                      variant="secondary"
                      className="px-3 py-2 text-xs"
                      onClick={() => recordShapeFeedback(activeShapeCallout, "refined")}
                    >
                      Refine
                    </Button>
                  </div>
                  {shapeFeedback[activeShapeCallout.id] ? (
                    <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                      Marked as {shapeFeedback[activeShapeCallout.id]}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
                  When a shape is active in a critique, Penny will name it here and show the pattern it is using.
                </p>
              )}
            </div>

            <div className="rounded-[24px] border border-black/8 bg-white p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Aging foundations monitor</p>
              <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">
                {selectedDecay ? `${selectedDecay.untouchedDays} days untouched` : "Select a node to track revisit decay"}
              </h3>

              {selectedDecay ? (
                <>
                  <p className="mt-3 text-sm leading-6 text-[var(--ink)]">
                    {selectedDecay.isFoundational
                      ? "Foundational beliefs at the base of large dependency structures decay faster because their failure cascades through the rest of the map."
                      : "Non-foundational claims decay more slowly, but still surface for revisit after enough time passes."}
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[18px] bg-[var(--panel)] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Revisit threshold</p>
                      <p className="mt-2 text-lg font-semibold text-[var(--ink)]">{selectedDecay.revisitThresholdDays} days</p>
                    </div>
                    <div className="rounded-[18px] bg-[var(--panel)] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Decayed confidence</p>
                      <p className="mt-2 text-lg font-semibold text-[var(--ink)]">
                        {selectedDecay.decayedConfidence != null ? formatScore(selectedDecay.decayedConfidence) : "n/a"}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
                    Confidence multiplier now sits at {Math.round(selectedDecay.decayMultiplier * 100)}%. Untouched beliefs are flagged before they go stale.
                  </p>

                  <div className="mt-4 rounded-[18px] bg-[var(--panel)] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Contradiction cascade tracer</p>
                    <div className="mt-3 space-y-2">
                      {selectedCascade.slice(0, 4).map((step) => (
                        <div key={step.nodeId} className="rounded-[16px] bg-white px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={step.depth === 0 ? "bg-[#e7defa] text-[#5c4c88]" : "bg-[var(--panel)] text-[var(--ink)]"}>
                              depth {step.depth}
                            </Badge>
                            <Badge className="bg-white text-[var(--ink)]">{step.label}</Badge>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{step.content}</p>
                          <p className="mt-1 text-xs leading-5 text-[var(--muted-ink)]">{step.reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 rounded-[18px] bg-[var(--panel)] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Session rhythm</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge className={rhythm.shouldStop ? "bg-[#fff6ed] text-[#8b4d1f]" : "bg-[#d9ead8] text-[#355b32]"}>
                        {rhythm.depletionScore}% depletion
                      </Badge>
                      {rhythm.signals.map((signal) => (
                        <Badge key={signal} className="bg-white text-[var(--ink)]">
                          {signal}
                        </Badge>
                      ))}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{rhythm.note}</p>
                  </div>
                </>
              ) : (
                <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
                  Select a node in the graph to see how long it has gone untouched and when Penny should revisit it.
                </p>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Map view</p>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--ink)]">
              {view === "outline" ? "Outline view keeps the active workflow intact." : "Graph view turns the same map into a decision lens."}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted-ink)]">
              {view === "outline"
                ? "Keep expanding, challenging, or connecting branches here while Penny’s best-next-move and founder-brief guidance stay visible above and below the map."
                : "Select a node to inspect its status, score highlights, and available outline actions. Graph interactions stay selection-only in this first slice."}
            </p>
          </div>
          <div className="inline-flex rounded-full border border-black/10 bg-white p-1 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
            <Button
              variant={view === "outline" ? "primary" : "ghost"}
              className={cn("px-4", view === "outline" && "shadow-none")}
              onClick={() => changeView("outline")}
            >
              Outline view
            </Button>
            <Button
              variant={view === "graph" ? "primary" : "ghost"}
              className={cn("px-4", view === "graph" && "shadow-none")}
              onClick={() => changeView("graph")}
            >
              Graph view
            </Button>
          </div>
        </div>

        {view === "outline" ? (
          <>
            <div className="mt-6 flex items-center gap-2">
              <CircleDot className="size-4 text-[var(--muted-ink)]" />
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Outline</p>
            </div>
            <div className="mt-6 space-y-4">{renderNode(rootNode)}</div>
          </>
        ) : (
          <>
            <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2">
                <Link2 className="size-4 text-[var(--muted-ink)]" />
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Graph</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge>Selection only</Badge>
                {map.graphSnapshot ? (
                  <>
                    <Badge className="bg-[#e7defa] text-[#5c4c88]">Overall score {formatScore(map.graphSnapshot.overallScore)}</Badge>
                    <Badge>Weak nodes {map.graphSnapshot.weakestNodeIds.length}</Badge>
                    <Badge>Critical dependencies {map.graphSnapshot.criticalDependencyIds.length}</Badge>
                  </>
                ) : (
                  <Badge>Derived from parent links</Badge>
                )}
              </div>
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_340px]">
              <div className="overflow-hidden rounded-[28px] border border-black/10 bg-[linear-gradient(180deg,#fffdf8_0%,#f7f2ea_100%)]">
                <div className="border-b border-black/8 px-5 py-4 text-sm leading-6 text-[var(--muted-ink)]">
                  Graph view highlights weak branches and dependency pressure. Use <span className="font-medium text-[var(--ink)]">Outline view</span> to run actions.
                </div>
                <div className="overflow-x-auto">
                  <div className="relative min-h-[400px]" style={{ width: graphCanvas.width, height: graphCanvas.height }}>
                    <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
                      {graphCanvas.edges.map((edge) => {
                        const startX = edge.from.x + GRAPH_NODE_WIDTH / 2 - 8;
                        const endX = edge.to.x - GRAPH_NODE_WIDTH / 2 + 8;
                        const controlOffset = Math.max((endX - startX) / 2, 36);
                        const isRelated = edge.parentId === selectedGraphNodeId || edge.childId === selectedGraphNodeId;

                        return (
                          <path
                            key={edge.id}
                            d={`M ${startX} ${edge.from.y} C ${startX + controlOffset} ${edge.from.y}, ${endX - controlOffset} ${edge.to.y}, ${endX} ${edge.to.y}`}
                            fill="none"
                            stroke={isRelated ? "#4a5565" : edge.isWeak ? "#c97d39" : "#c6bfb4"}
                            strokeLinecap="round"
                            strokeWidth={isRelated ? 2.5 : edge.isCritical ? 2 : 1.5}
                            opacity={isRelated ? 1 : 0.8}
                          />
                        );
                      })}
                    </svg>

                    {graphCanvas.nodes.map((graphNode) => {
                      const isSelected = graphNode.node.id === selectedGraphNodeId;

                      return (
                        <button
                          key={graphNode.node.id}
                          type="button"
                          aria-pressed={isSelected}
                          className={cn(
                            "absolute -translate-x-1/2 -translate-y-1/2 rounded-[24px] border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] focus-visible:ring-offset-2",
                            "w-[188px] shadow-[0_16px_36px_rgba(15,23,42,0.08)]",
                            statusTone(graphNode.node.nodeStatus),
                            isSelected && "border-[var(--ink)] ring-2 ring-[var(--ink)] ring-offset-2",
                            !isSelected && "hover:border-black/25",
                          )}
                          style={{ left: graphNode.x, top: graphNode.y }}
                          onClick={() => setSelectedGraphNodeId(graphNode.node.id)}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={statusBadge(graphNode.node.nodeStatus)}>{graphNode.node.nodeStatus}</Badge>
                            {graphNode.isWeak ? <Badge className="bg-[#f5d6b3] text-[#8b4d1f]">weak focus</Badge> : null}
                            {graphNode.isCritical ? <Badge className="bg-[#e7defa] text-[#5c4c88]">dependency</Badge> : null}
                          </div>
                          <p className="mt-3 text-sm font-medium leading-5 text-[var(--ink)]">{kindLabel(graphNode.node.kind)}</p>
                          <p className="mt-2 max-h-[3.6rem] overflow-hidden text-sm leading-6 text-[var(--muted-ink)]">
                            {graphNode.node.content}
                          </p>
                          <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                            strength {formatScore(graphNode.node.scores?.strength ?? null)}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-black/10 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Inspector</p>
                    <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">
                      {selectedGraphNode ? "Selected node" : "Select a node"}
                    </h3>
                  </div>
                  {selectedGraphNode ? <Badge>{kindLabel(selectedGraphNode.node.kind)}</Badge> : null}
                </div>

                {selectedGraphNode ? (
                  <>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Badge className={statusBadge(selectedGraphNode.node.nodeStatus)}>{selectedGraphNode.node.nodeStatus}</Badge>
                      {selectedGraphNode.isWeak ? <Badge className="bg-[#f5d6b3] text-[#8b4d1f]">weak focus</Badge> : null}
                      {selectedGraphNode.isCritical ? <Badge className="bg-[#e7defa] text-[#5c4c88]">critical dependency</Badge> : null}
                      <Badge>Children {selectedGraphNode.childCount}</Badge>
                    </div>

                    <p className="mt-4 text-sm leading-7 text-[var(--ink)]">{selectedGraphNode.node.content}</p>
                    {selectedGraphNode.node.note ? (
                      <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">{selectedGraphNode.node.note}</p>
                    ) : null}
                    {selectedGraphNodeParent ? (
                      <p className="mt-4 text-xs leading-5 text-[var(--muted-ink)]">
                        Parent: <span className="font-medium text-[var(--ink)]">{selectedGraphNodeParent.content}</span>
                      </p>
                    ) : null}

                    <div className="mt-6">
                      <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Score highlights</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {inspectorScores.map((score) => (
                          <div key={score.label} className="rounded-[20px] bg-[var(--panel)] px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">{score.label}</p>
                            <p className="mt-2 text-lg font-semibold text-[var(--ink)]">{formatScore(score.value)}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-6">
                      <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Available in Outline</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {visibleActions(selectedGraphNode.node).map((action) => (
                          <Badge key={action.key} className="bg-[var(--panel)] text-[var(--ink)]">
                            {action.label}
                          </Badge>
                        ))}
                      </div>
                      <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
                        Keep graph interactions selection-only in this slice. Switch back to <span className="font-medium text-[var(--ink)]">Outline view</span> to run a move.
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="mt-4 text-sm leading-6 text-[var(--muted-ink)]">
                    Select a node in the graph to inspect its content, status, score highlights, and outline actions.
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </Card>

      <Card className="p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Founder brief</p>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Turn the map into a decision artifact.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted-ink)]">{founderBriefReadinessMessage()}</p>
            {founderBriefError ? <p className="mt-2 text-sm leading-6 text-[#8b4d1f]">{founderBriefError}</p> : null}
          </div>

          <Button
            className="gap-2"
            disabled={!map.founderBriefReadiness.eligible || runningFounderBrief || isPending}
            onClick={runFounderBrief}
          >
            <Sparkles className="size-4" />
            Generate founder brief
          </Button>
        </div>
      </Card>

      {map.founderBrief ? <FounderBriefCard brief={map.founderBrief} /> : null}
    </div>
  );
}
