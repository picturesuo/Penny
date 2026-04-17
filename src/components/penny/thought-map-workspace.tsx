"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { AlertCircle, ArrowRightLeft, CircleDot, GitBranchPlus, Link2, Sparkles } from "lucide-react";
import { FounderBriefCard } from "@/components/penny/founder-brief-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type {
  CognitiveIntervention,
  FounderBriefModel,
  ThoughtMapGraphSnapshot,
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

function normalizeMap(map: SerializableThoughtMap): ThoughtMapModel {
  return {
    ...map,
    nodes: map.nodes.map(normalizeNode),
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
  const selectedGraphNodeParent = selectedGraphNode?.node.parentId
    ? nodesById.get(selectedGraphNode.node.parentId) ?? null
    : null;
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
        updatedAt: new Date(),
      };
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
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Override trail</p>
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
            <Badge>{lastAction.reasoning.graphAnalysis.primaryGap}</Badge>
          </div>
          <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
            Penny targeted <span className="font-medium">{lastAction.execution.targetNodeKind.replaceAll("_", " ")}</span> because the graph’s weakest gap was{" "}
            <span className="font-medium">{lastAction.reasoning.graphAnalysis.primaryGap}</span>.
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
