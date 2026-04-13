"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertCircle, ArrowRightLeft, CircleDot, GitBranchPlus, Link2, Sparkles } from "lucide-react";
import { FounderBriefCard } from "@/components/penny/founder-brief-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

export function ThoughtMapWorkspace({ initialMap }: { initialMap: SerializableThoughtMap }) {
  const [map, setMap] = useState(() => normalizeMap(initialMap));
  const [lastAction, setLastAction] = useState<ActionResponse | null>(null);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
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

  function mergeMapUpdate(response: ActionResponse) {
    const updatedNodes = response.updatedNodes.map(normalizeNode);
    const createdNodes = response.createdNodes.map(normalizeNode);
    const updatedLookup = new Map(updatedNodes.map((node) => [node.id, node]));
    const baseNodes = map.nodes.map((node) => updatedLookup.get(node.id) ?? node);
    const deduped = new Map(baseNodes.map((node) => [node.id, node]));

    for (const node of createdNodes) {
      deduped.set(node.id, node);
    }

    setMap({
      ...map,
      nodes: Array.from(deduped.values()).sort(
        (a, b) => a.branchOrder - b.branchOrder || a.createdAt.getTime() - b.createdAt.getTime(),
      ),
      graphSnapshot: response.graphSnapshot ?? map.graphSnapshot,
      interventions: response.interventions?.map(normalizeIntervention) ?? map.interventions,
      recommendedIntervention: response.recommendedIntervention
        ? normalizeIntervention(response.recommendedIntervention)
        : response.recommendedIntervention === null
          ? null
          : map.recommendedIntervention,
      recommendedNextMove: response.recommendedNextMove ?? map.recommendedNextMove,
      updatedAt: new Date(),
    });
  }

  function runAction(nodeId: string, action: (typeof ACTIONS)[number]["key"]) {
    setActiveNodeId(nodeId);

    startTransition(async () => {
      const response = await fetch(`/api/maps/${map.id}/nodes/${nodeId}/actions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      });

      if (!response.ok) {
        setActiveNodeId(null);
        return;
      }

      const payload = (await response.json()) as ActionResponse;
      setLastAction(payload);
      mergeMapUpdate(payload);
      setActiveNodeId(null);
    });
  }

  function runRecommendedNextMove() {
    if (!map.recommendedNextMove) {
      return;
    }

    setRunningRecommendedMove(true);

    startTransition(async () => {
      const response = await fetch(`/api/maps/${map.id}/recommended-next-move`, {
        method: "POST",
      });

      if (!response.ok) {
        setRunningRecommendedMove(false);
        return;
      }

      const payload = (await response.json()) as ActionResponse;
      setLastAction(payload);
      mergeMapUpdate(payload);
      setRunningRecommendedMove(false);
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
      const response = await fetch(`/api/maps/${map.id}/founder-brief`, {
        method: "POST",
      });

      if (!response.ok) {
        setFounderBriefError(
          response.status === 409 ? founderBriefReadinessMessage() : "Penny could not generate the founder brief.",
        );
        setRunningFounderBrief(false);
        return;
      }

      const payload = (await response.json()) as FounderBriefResponse;
      setMap(normalizeMap(payload.map));
      setRunningFounderBrief(false);
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
            Click any branch to expand it, challenge it, replace weak logic, or connect it to stronger evidence.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Badge className="bg-[#d9ead8] text-[#355b32]">Active {statusCounts.active}</Badge>
          <Badge className="bg-[#f5d6b3] text-[#8b4d1f]">Weak {statusCounts.weak}</Badge>
          <Badge className="bg-black/8 text-[var(--muted-ink)]">Superseded {statusCounts.superseded}</Badge>
        </div>
      </div>

      {map.recommendedNextMove ? (
        <Card className="p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Best next move</Badge>
            <Badge className="bg-[#e7defa] text-[#5c4c88]">{map.recommendedNextMove.action.replaceAll("_", " ")}</Badge>
            <Badge>{map.recommendedNextMove.targetNodeKind.replaceAll("_", " ")}</Badge>
          </div>
          <p className="mt-3 text-sm leading-7 text-[var(--ink)]">{map.recommendedNextMove.headline}</p>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{map.recommendedNextMove.explanation}</p>
          <p className="mt-3 text-sm leading-6 text-[var(--ink)]">
            Target: <span className="font-medium">{map.recommendedNextMove.targetNodeContent}</span>
          </p>
          <div className="mt-4 space-y-2">
            {map.recommendedNextMove.reasoning.why.slice(0, 2).map((reason) => (
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
          <div className="mt-4">
            <Button
              className="gap-2"
              disabled={runningRecommendedMove || isPending}
              onClick={runRecommendedNextMove}
            >
              <Sparkles className="size-4" />
              Do the best next move
            </Button>
          </div>
        </Card>
      ) : null}

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
        <div className="flex items-center gap-2">
          <CircleDot className="size-4 text-[var(--muted-ink)]" />
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Graph</p>
        </div>
        <div className="mt-6 space-y-4">{renderNode(rootNode)}</div>
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
