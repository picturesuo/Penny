"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { AlertCircle, ArrowRightLeft, CircleDot, GitBranchPlus, Link2, Sparkles } from "lucide-react";
import { FounderBriefCard } from "@/components/penny/founder-brief-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  buildClaimMoveHistory,
  buildClaimDependencyGraph,
  buildBeliefGenealogy,
  buildDevilsAdvocateReceipts,
  buildConfidenceDecaySnapshot,
  buildConfusionLog,
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
  type PennyShape,
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
      critiqueTags: string[];
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

function critiqueDepthLabel(node: ThoughtNodeModel) {
  const confidence = node.scores?.confidence ?? 0;

  if (confidence >= 0.8) {
    return "heavy";
  }

  if (confidence >= 0.6) {
    return "medium";
  }

  return "light";
}

function critiqueDepthNote(node: ThoughtNodeModel) {
  const confidence = node.scores?.confidence ?? 0;

  if (confidence >= 0.8) {
    return "High confidence deserves heavier critique because motivated reasoning hides there.";
  }

  if (confidence >= 0.6) {
    return "Moderate confidence gets balanced pressure so uncertainty still has room to resolve.";
  }

  return "Low confidence already carries uncertainty, so Penny keeps the critique lighter and more targeted.";
}

function critiqueStrengthLabel(score: number | null | undefined) {
  const value = score ?? 0;

  if (value >= 0.75) {
    return {
      label: "strong",
      note: "Attacks a load-bearing structure instead of a surface detail.",
    };
  }

  if (value >= 0.5) {
    return {
      label: "moderate",
      note: "Challenges an assumption the user could potentially operationalize away.",
    };
  }

  return {
    label: "weak",
    note: "Mostly rhetorical, useful as a prompt but not yet the hardest attack.",
  };
}

function knowledgeSurface(node: ThoughtNodeModel | null, genealogy: ReturnType<typeof buildBeliefGenealogy>) {
  if (!node) {
    return {
      understood: [] as string[],
      needsWork: [] as string[],
      masteryLevel: "unmeasured" as "unmeasured" | "growing" | "solid",
      teachBackGap: [] as string[],
      reviewPrompt: "Select a node to see what Penny thinks you already know and what still needs teach-back.",
    };
  }

  const understood = [
    node.scores?.evidence != null && node.scores.evidence >= 0.65 ? "evidence collection" : null,
    node.scores?.specificity != null && node.scores.specificity >= 0.65 ? "claim specificity" : null,
    node.scores?.testability != null && node.scores.testability >= 0.6 ? "test design" : null,
    genealogy.contradictions.length > 0 ? "counterargument handling" : null,
    genealogy.dependents.length > 0 ? "dependency tracing" : null,
    (node.psychology?.falsificationCoverageScore ?? 0) >= 0.65 ? "falsification" : null,
  ].filter((value): value is string => value != null);

  const needsWork = [
    node.scores?.evidence != null && node.scores.evidence < 0.65 ? "evidence collection" : null,
    node.scores?.specificity != null && node.scores.specificity < 0.65 ? "claim specificity" : null,
    node.scores?.testability != null && node.scores.testability < 0.6 ? "test design" : null,
    node.scores?.dependencyRisk != null && node.scores.dependencyRisk > 0.55 ? "dependency reasoning" : null,
    genealogy.contradictions.length === 0 ? "counterargument handling" : null,
    (node.psychology?.comparisonCoverageScore ?? 1) < 0.6 ? "comparison set quality" : null,
    (node.psychology?.falsificationCoverageScore ?? 1) < 0.6 ? "falsification" : null,
  ].filter((value): value is string => value != null);

  const uniqueUnderstood = Array.from(new Set(understood));
  const uniqueNeedsWork = Array.from(new Set(needsWork));
  const teachBackGap = uniqueNeedsWork.slice(0, 3);
  const masteryLevel =
    uniqueUnderstood.length >= 4 && uniqueNeedsWork.length <= 1
      ? "solid"
      : uniqueUnderstood.length >= 2
        ? "growing"
        : "unmeasured";

  return {
    understood: uniqueUnderstood,
    needsWork: uniqueNeedsWork,
    masteryLevel,
    teachBackGap,
    reviewPrompt:
      uniqueNeedsWork.length > 0
        ? `Teach-back gap: ${uniqueNeedsWork.slice(0, 2).join(" and ")} need another pass in this claim’s context.`
        : "Teach-back gap: none obvious. Explain the concept back at the same level of difficulty to prove it stays solid.",
  };
}

function shapeMetacognition(shape: PennyShape | null) {
  if (!shape) {
    return null;
  }

  const pattern = shape.label;
  const research =
    shape.kind === "domain"
      ? "Domain shapes are derived from repeated critique and calibration signals."
      : "Cognitive shapes are derived from recurring self-protection, repetition, and revision patterns.";
  const response =
    shape.verdict === "confirmed"
      ? "Keep using this pattern as an active lens."
      : shape.verdict === "provisional"
        ? "Use it cautiously and keep testing for corroboration."
        : shape.verdict === "rejected"
          ? "Push back on the pattern when it appears again."
          : "Refine the pattern with more evidence and better counterexamples.";

  return { pattern, research, response };
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
  const [shapeOverrideReasons, setShapeOverrideReasons] = useState<Record<string, string>>({});
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
  const activeShapeTeaching = useMemo(() => shapeMetacognition(activeShapeCallout), [activeShapeCallout]);
  const activeShapeReasoning = activeShapeCallout ? (shapeOverrideReasons[activeShapeCallout.id] ?? "").trim() : "";
  const selectedGenealogy = useMemo(
    () => buildBeliefGenealogy(map.nodes, selectedGraphNode?.node.id ?? defaultGraphNodeId ?? rootNode?.id ?? ""),
    [defaultGraphNodeId, map.nodes, rootNode?.id, selectedGraphNode?.node.id],
  );
  const selectedKnowledgeSurface = useMemo(
    () => knowledgeSurface(selectedGraphNode?.node ?? null, selectedGenealogy),
    [selectedGenealogy, selectedGraphNode?.node],
  );
  const selectedOldSelves = useMemo(
    () => buildOldSelfTimeline(map.nodes, map.events, selectedGraphNode?.node.id ?? defaultGraphNodeId ?? rootNode?.id ?? ""),
    [defaultGraphNodeId, map.events, map.nodes, rootNode?.id, selectedGraphNode?.node.id],
  );
  const selectedMoveHistory = useMemo(
    () => buildClaimMoveHistory(map.nodes, map.events, selectedGraphNode?.node.id ?? defaultGraphNodeId ?? rootNode?.id ?? ""),
    [defaultGraphNodeId, map.events, map.nodes, rootNode?.id, selectedGraphNode?.node.id],
  );
  const claimDependencyGraph = useMemo(() => buildClaimDependencyGraph(map), [map]);
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
  const confusionLog = useMemo(() => buildConfusionLog(map), [map]);
  const bestSteelmanTarget = map.recommendedNextMove
    ? map.nodes.find((node) => node.id === map.recommendedNextMove?.targetNodeId) ?? null
    : selectedGraphNode?.node ?? weakestLearningNode ?? map.nodes.find((node) => node.kind === "core_claim") ?? rootNode ?? null;
  const steelmanTargetText = bestSteelmanTarget?.content ?? map.rawThought;
  const steelmanPrompt = `Argue the strongest possible version of this position: ${steelmanTargetText}`;
  const selectedCritiqueStrength = critiqueStrengthLabel(selectedGraphNode?.node.scores?.strength ?? null);
  const selectedNormChallengeNode =
    selectedGraphNode?.node ?? map.nodes.find((node) => /norm|should|must|rule/i.test(node.content)) ?? null;
  const selectedPrecedentSummary =
    selectedPrecedents[0] ?? null;
  const synthesisPreMortem = selectedGraphNode?.node.content ?? map.recommendedNextMove?.summary ?? map.rawThought;
  const synthesisIfRight = selectedGraphNode
    ? `If this claim holds, what becomes possible and what becomes necessary for ${kindLabel(selectedGraphNode.node.kind)} work?`
    : "If this claim holds, what becomes possible and what becomes necessary?";
  const synthesisTwinCheck = steelmanTargetText;
  const synthesisDependencyCount = claimDependencyGraph.loadBearingNodeIds.length;
  const synthesisMissingCoverage = map.founderBriefReadiness.missingRequirements.map((requirement) =>
    requirement.replaceAll("_", " "),
  );
  const dialecticRounds = [
    {
      round: "Round 1",
      title: "Opening critique",
      strength: selectedCritiqueStrength.label,
      prompt: selectedGraphNode
        ? `Penny opens with its sharpest attack on ${kindLabel(selectedGraphNode.node.kind)}.`
        : "Penny opens with its sharpest attack on the active claim.",
      why: lastAction?.reasoning.graphAnalysis?.primaryGap
        ? `Failure type: ${lastAction.reasoning.graphAnalysis.primaryGap.replaceAll("-", " ")}`
        : "Failure type: not yet selected",
      responsePath: "Defend, revise, or absorb.",
    },
    {
      round: "Round 2",
      title: "User response",
      strength: "response-driven",
      prompt:
        "The user’s reply becomes a move. Penny reads the reasoning, stores the disagreement, and avoids repeating itself.",
      why: selectedPrecedentSummary
        ? `Precedent source: ${selectedPrecedentSummary.name} · ${selectedPrecedentSummary.domain}`
        : "Precedent source: none selected yet",
      responsePath: "Defend / revise / absorb change the downstream record differently.",
    },
    {
      round: "Round 3",
      title: "Escalate or pivot",
      strength: selectedPrecedentSummary ? "precedent-backed" : "open",
      prompt: selectedPrecedentSummary
        ? `Penny escalates using ${selectedPrecedentSummary.failureMode} precedent or pivots to the next risk angle.`
        : "Penny escalates to a stronger critique or pivots to a different angle of attack.",
      why: activeShapeCallout ? `Shape pattern: ${activeShapeCallout.label}` : "Shape pattern: no active pattern yet",
      responsePath: "Future rounds inherit the full history of the thread.",
    },
  ] as const;
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

  function recordShapeFeedback(
    shape: { id: string; label: string; primaryMapId: string | null },
    verdict: PennyShapeFeedback,
    reasoning: string,
  ) {
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
            reasoning,
            nodeId: selectedGraphNode?.node.id ?? selectedGraphNodeModel?.id ?? null,
          }),
        });

        if (!response.ok) {
          restoreFeedback();
          return;
        }

        const payload = (await response.json()) as { event: SerializableThoughtMapEvent };
        mergeShapeFeedbackEvent(payload.event);
        setShapeOverrideReasons((current) => {
          const next = { ...current };
          delete next[shape.id];
          return next;
        });
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

            <div className="rounded-[24px] border border-black/8 bg-white p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Teach-back</p>
              <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">Explain it in the context of this claim.</h3>
              <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">
                Penny gives the minimum scaffold, then asks you to generate the explanation yourself so the gap shows up where it matters.
              </p>
              {selectedGraphNode ? (
                <div className="mt-4 rounded-[20px] bg-[var(--panel)] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Minimum scaffold</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--ink)]">
                    Define the concept, connect it to this claim, and name one thing that would make the claim stronger or weaker.
                  </p>
                  <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
                    Now explain how it applies to: <span className="font-medium text-[var(--ink)]">{selectedGraphNode.node.content}</span>
                  </p>
                </div>
              ) : (
                <p className="mt-4 rounded-[20px] bg-[var(--panel)] p-4 text-sm leading-6 text-[var(--muted-ink)]">
                  Select a node to turn this into a claim-anchored teach-back prompt.
                </p>
              )}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[18px] bg-[var(--panel)] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Gap detection</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedKnowledgeSurface.teachBackGap.length ? (
                      selectedKnowledgeSurface.teachBackGap.map((gap) => (
                        <Badge key={gap} className="bg-[#fff6ed] text-[#8b4d1f]">
                          {gap}
                        </Badge>
                      ))
                    ) : (
                      <Badge className="bg-[#d9ead8] text-[#355b32]">No obvious gap</Badge>
                    )}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">{selectedKnowledgeSurface.reviewPrompt}</p>
                </div>
                <div className="rounded-[18px] bg-[var(--panel)] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Level match</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge className="bg-white text-[var(--ink)]">{selectedKnowledgeSurface.masteryLevel}</Badge>
                    <Badge className="bg-[#e7defa] text-[#5c4c88]">{selectedKnowledgeSurface.understood.length} mastered</Badge>
                    <Badge className="bg-[#fff6ed] text-[#8b4d1f]">{selectedKnowledgeSurface.needsWork.length} to relearn</Badge>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
                    Future critique pitches at this level instead of repeating basics or skipping the missing pieces.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-black/8 bg-white p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Knowledge shape</p>
              <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">What Penny thinks you already know here.</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[18px] bg-[var(--panel)] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Demonstrated</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedKnowledgeSurface.understood.length ? (
                      selectedKnowledgeSurface.understood.map((concept) => (
                        <Badge key={concept} className="bg-white text-[var(--ink)]">
                          {concept}
                        </Badge>
                      ))
                    ) : (
                      <Badge className="bg-white text-[var(--ink)]">No demonstrated concepts yet</Badge>
                    )}
                  </div>
                </div>
                <div className="rounded-[18px] bg-[var(--panel)] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Needs work</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedKnowledgeSurface.needsWork.length ? (
                      selectedKnowledgeSurface.needsWork.map((concept) => (
                        <Badge key={concept} className="bg-[#fff6ed] text-[#8b4d1f]">
                          {concept}
                        </Badge>
                      ))
                    ) : (
                      <Badge className="bg-[#d9ead8] text-[#355b32]">No obvious gaps</Badge>
                    )}
                  </div>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-[var(--muted-ink)]">
                {selectedKnowledgeSurface.reviewPrompt}
              </p>
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
                        <Badge className="bg-[#e7defa] text-[#5c4c88]">critique {critiqueDepthLabel(node)}</Badge>
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
                      <p className="mt-2 text-xs leading-5 text-[var(--muted-ink)]">{critiqueDepthNote(node)}</p>
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
              {selectedGraphNode ? (
                <Badge className="mt-3 bg-[#e7defa] text-[#5c4c88]">critique {critiqueDepthLabel(selectedGraphNode.node)}</Badge>
              ) : null}
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

      <Card className="p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Dialectic rounds</Badge>
          <Badge className="bg-[#e7defa] text-[#5c4c88]">round-tracked</Badge>
          <Badge className="bg-[#d9ead8] text-[#355b32]">{selectedCritiqueStrength.label}</Badge>
        </div>
        <h2 className="mt-3 text-2xl font-semibold text-[var(--ink)]">Counterargument as explicit rounds, not a one-shot critique.</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
          Penny should remember every round, carry the user’s response history forward, and change the next attack instead of reusing the same line.
        </p>
        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          {dialecticRounds.map((round) => (
            <div key={round.round} className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-white text-[var(--ink)]">{round.round}</Badge>
                <Badge className="bg-[#e7defa] text-[#5c4c88]">{round.strength}</Badge>
              </div>
              <p className="mt-3 text-sm font-medium text-[var(--ink)]">{round.title}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{round.prompt}</p>
              <details className="mt-3 rounded-[18px] bg-white p-4">
                <summary className="cursor-pointer text-sm font-medium text-[var(--ink)]">Why this critique</summary>
                <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">{round.why}</p>
              </details>
              <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">{round.responsePath}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {(["defend", "revise", "absorb"] as const).map((path) => (
            <Badge key={path} className="bg-white text-[var(--ink)]">
              {path}
            </Badge>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Calibration gate</Badge>
          <Badge className="bg-[#e7defa] text-[#5c4c88]">synthesis</Badge>
          <Badge className="bg-[#d9ead8] text-[#355b32]">{synthesisDependencyCount} load-bearing claims</Badge>
        </div>
        <h2 className="mt-3 text-2xl font-semibold text-[var(--ink)]">
          Pre-mortem, if-you-were-right, twin-check, and dependency completeness.
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
          These gates keep synthesis honest by forcing failure thinking, consequence thinking, a calibrated steelman, and a visible review of what is still at risk.
        </p>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Pre-mortem</p>
            <p className="mt-3 text-sm leading-7 text-[var(--ink)]">Six months later, this failed because {synthesisPreMortem}.</p>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
              This should be short, stored, and reviewed before Penny synthesizes any artifact.
            </p>
          </div>

          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">If you were right</p>
            <p className="mt-3 text-sm leading-7 text-[var(--ink)]">{synthesisIfRight}</p>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
              If the user cannot generate consequences, the belief is still performative rather than load-bearing.
            </p>
          </div>

          <div className="rounded-[24px] border border-black/8 bg-white p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Twin-check</p>
            <p className="mt-3 text-sm leading-7 text-[var(--ink)]">{synthesisTwinCheck}</p>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
              Penny should expose its strongest version of the user’s thinking and let the user decide whether it actually matches their intent.
            </p>
          </div>

          <div className="rounded-[24px] border border-black/8 bg-white p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Dependency completeness</p>
            <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
              {synthesisDependencyCount
                ? `${synthesisDependencyCount} load-bearing claims are visible here.`
                : "No load-bearing claims have been isolated yet."}
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
              {synthesisMissingCoverage.length
                ? `Still at risk: ${synthesisMissingCoverage.join(", ")}. Penny should ask whether to proceed anyway.`
                : "The map has the minimum structure Penny expects before synthesis."}
            </p>
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
          <div className="mt-3 flex flex-wrap gap-2">
            {lastAction.reasoning.graphAnalysis.critiqueTags.map((tag) => (
              <Badge key={tag} className="bg-[var(--panel)] text-[var(--ink)]">
                {tag.replaceAll("-", " ")}
              </Badge>
            ))}
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
              {selectedOldSelves.map((snapshot, index) => {
                const previousConfidence = index > 0 ? selectedOldSelves[index - 1]?.confidence : null;
                const drift =
                  previousConfidence != null && snapshot.confidence != null ? snapshot.confidence - previousConfidence : null;

                return (
                <div key={snapshot.id} className={cn("rounded-[20px] bg-white p-4", snapshot.isCurrent && "ring-2 ring-[var(--ink)] ring-offset-1")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-[var(--panel)] text-[var(--ink)]">{snapshot.versionLabel}</Badge>
                    <Badge className={statusBadge(snapshot.status)}>{snapshot.status}</Badge>
                    {snapshot.confidence != null ? (
                      <Badge className="bg-[#d9ead8] text-[#355b32]">confidence {formatScore(snapshot.confidence)}</Badge>
                    ) : null}
                    {drift != null && drift !== 0 ? (
                      <Badge className={drift > 0 ? "bg-[#d9ead8] text-[#355b32]" : "bg-[#fff6ed] text-[#8b4d1f]"}>
                        {drift > 0 ? "↑" : "↓"} {Math.round(Math.abs(drift) * 100)} drift
                      </Badge>
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
                );
              })}
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
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Claim dependency graph</p>
              <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">Load-bearing claims and edges</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[18px] bg-[var(--panel)] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Roots</p>
                  <p className="mt-2 text-lg font-semibold text-[var(--ink)]">{claimDependencyGraph.rootNodeIds.length}</p>
                </div>
                <div className="rounded-[18px] bg-[var(--panel)] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Load-bearing</p>
                  <p className="mt-2 text-lg font-semibold text-[var(--ink)]">{claimDependencyGraph.loadBearingNodeIds.length}</p>
                </div>
                <div className="rounded-[18px] bg-[var(--panel)] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Edges</p>
                  <p className="mt-2 text-lg font-semibold text-[var(--ink)]">{claimDependencyGraph.edges.length}</p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {claimDependencyGraph.loadBearingNodeIds.slice(0, 4).map((nodeId) => {
                  const node = nodesById.get(nodeId);

                  if (!node) {
                    return null;
                  }

                  return (
                    <div key={nodeId} className="rounded-[18px] bg-[var(--panel)] p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={statusBadge(node.nodeStatus)}>{node.nodeStatus}</Badge>
                        <Badge className="bg-white text-[var(--ink)]">{kindLabel(node.kind)}</Badge>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{node.content}</p>
                    </div>
                  );
                })}
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

            <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Move query lens</p>
              <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">Query the move layer like a real substrate.</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                The view should be addressable by claim, time range, event type, decision outcome, override, and recency so the same event log can power timelines and review.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge className="bg-white text-[var(--ink)]">Claim: {selectedGraphNode?.node.kind.replaceAll("_", " ") ?? "current node"}</Badge>
                <Badge className="bg-white text-[var(--ink)]">Time: recent history</Badge>
                <Badge className="bg-white text-[var(--ink)]">Events: move / feedback / signal</Badge>
                <Badge className="bg-white text-[var(--ink)]">Decision: {lastAction?.action ?? "n/a"}</Badge>
                <Badge className="bg-white text-[var(--ink)]">Override: {shapeFeedback[activeShapeCallout?.id ?? ""] ? "logged" : "pending"}</Badge>
                <Badge className="bg-white text-[var(--ink)]">Recency: {selectedMoveHistory.length ? `${selectedMoveHistory.slice(-5).length} visible` : "n/a"}</Badge>
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
                  <div className="mt-4 space-y-3">
                    <textarea
                      className="min-h-[96px] w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm leading-6 text-[var(--ink)] outline-none transition focus:border-[var(--ink)]"
                      placeholder="Why do you disagree? What load-bearing assumption or precedent are you testing?"
                      value={shapeOverrideReasons[activeShapeCallout.id] ?? ""}
                      onChange={(event) =>
                        setShapeOverrideReasons((current) => ({
                          ...current,
                          [activeShapeCallout.id]: event.target.value,
                        }))
                      }
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        className="px-3 py-2 text-xs"
                        disabled={isPending || activeShapeReasoning.length < 8}
                        onClick={() =>
                          recordShapeFeedback(
                            activeShapeCallout,
                            "confirmed",
                            activeShapeReasoning,
                          )
                        }
                      >
                        Confirm
                      </Button>
                      <Button
                        variant="secondary"
                        className="px-3 py-2 text-xs"
                        disabled={isPending || activeShapeReasoning.length < 8}
                        onClick={() =>
                          recordShapeFeedback(
                            activeShapeCallout,
                            "rejected",
                            activeShapeReasoning,
                          )
                        }
                      >
                        Reject
                      </Button>
                      <Button
                        variant="secondary"
                        className="px-3 py-2 text-xs"
                        disabled={isPending || activeShapeReasoning.length < 8}
                        onClick={() =>
                          recordShapeFeedback(
                            activeShapeCallout,
                            "refined",
                            activeShapeReasoning,
                          )
                        }
                      >
                        Refine
                      </Button>
                    </div>
                  </div>
                  {shapeFeedback[activeShapeCallout.id] ? (
                    <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                      Marked as {shapeFeedback[activeShapeCallout.id]}
                    </p>
                  ) : null}
                  {activeShapeTeaching ? (
                    <div className="mt-4 rounded-[18px] bg-white p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Metacognition teaching</p>
                      <p className="mt-2 text-sm leading-6 text-[var(--ink)]">
                        Pattern: <span className="font-medium">{activeShapeTeaching.pattern}</span>
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{activeShapeTeaching.research}</p>
                      <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">Response: {activeShapeTeaching.response}</p>
                    </div>
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

                  <div className="mt-4 rounded-[18px] bg-[var(--panel)] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Confusion log</p>
                    <div className="mt-3 space-y-2">
                  {confusionLog.length ? (
                    confusionLog.map((entry) => (
                          <div key={entry.nodeId} className="rounded-[16px] bg-white px-4 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge className="bg-[#e7defa] text-[#5c4c88]">severity {entry.severity}</Badge>
                              <Badge className="bg-[#fff6ed] text-[#8b4d1f]">{entry.ageDays} days old</Badge>
                              <Badge className="bg-white text-[var(--ink)]">{entry.title}</Badge>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{entry.confusion}</p>
                            <p className="mt-1 text-xs leading-5 text-[var(--muted-ink)]">{entry.nextStep}</p>
                            <p className="mt-1 text-xs leading-5 text-[var(--muted-ink)]">{entry.revisitPrompt}</p>
                          </div>
                        ))
                      ) : (
                        <p className="rounded-[16px] bg-white px-4 py-3 text-sm leading-6 text-[var(--muted-ink)]">
                          No strong confusion signals are surfacing right now.
                        </p>
                      )}
                    </div>
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
