"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type CSSProperties } from "react";

import { ChallengeExperience, type ChallengeResponsePath } from "./challenge/challenge-experience";
import { ConfidenceChip } from "./confidence/ConfidenceChip";
import { BrainGraphMap, createBrainGraph } from "./graph";
import { LearnExperience } from "./learn/learn-experience";
import { EmptyState, ErrorState, Skeleton } from "./ui";
import { useWorkspaceState, type WorkspaceMode } from "../lib/state/workspace-state";
import type { GraphModel, GraphNode } from "../lib/types/graph";
import { CommandPalette } from "../src/components/command/CommandPalette";
import { InspectorRail } from "../src/components/inspector/InspectorRail";
import { useCommandPalette, type CommandPaletteItem, type CommandResult } from "../src/hooks/useCommandPalette";

type WorkspaceCommandMode = "Brain" | "Challenge" | "Learn";

type BreadcrumbItem = {
  kind: "map" | "claim";
  id: string;
  label: string;
};

type ShellContext = {
  mode: WorkspaceMode;
  mapId: string | null;
  claimId: string | null;
  breadcrumb?: BreadcrumbItem[];
  breadcrumbItems?: BreadcrumbItem[];
};

type WorkspaceContext = {
  mode: WorkspaceMode;
  mapId: string | null;
  claimId: string | null;
};

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

type ClaimView = {
  id: string;
  mapId?: string;
  userId?: string;
  body: string;
  confidenceBps?: number | null;
  createdAt?: string;
  updatedAt?: string;
};

type BrainView = {
  workspaceContext?: WorkspaceContext;
  currentContext?: WorkspaceContext;
  mapSummary: {
    id: string;
    title: string;
    claimCount: number;
  } | null;
  claims: ClaimView[];
  selectedClaim: ClaimView | null;
  recentEvents?: unknown[];
};

type ChallengeView = {
  shellContext?: ShellContext;
  workspaceContext?: ShellContext;
  activeClaim: ClaimView | null;
  activeChallengeRound: {
    id: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  } | null;
  critiqueStatus: string;
  critiqueState?: {
    status: string;
    critiqueId: string | null;
    body?: string;
    critiquePayload?: unknown;
    provider?: string;
    model?: string;
    promptVersion?: string;
  };
  critiquePayload?: unknown;
};

type LearnView = {
  shellContext?: ShellContext;
  workspaceContext?: ShellContext;
  selectedMapId: string | null;
  selectedClaimId: string | null;
  selectedClaim: ClaimView | null;
  learnState: {
    status: string;
    message: string;
  };
  status: string;
  message?: string;
};

type ProjectionView = BrainView | ChallengeView | LearnView;

type ProjectionState = {
  isLoading: boolean;
  mode: WorkspaceMode;
  shell: ShellContext | null;
  view: ProjectionView | null;
  error: string | null;
};

type ActionState = {
  status: "idle" | "pending" | "success" | "error";
  message: string | null;
};

type WorkspaceSelectionResult = {
  mode: WorkspaceCommandMode;
  mapId: string;
  claimId: string | null;
};

const modes: Array<{ id: WorkspaceMode; label: string }> = [
  { id: "brain", label: "Brain" },
  { id: "challenge", label: "Challenge" },
  { id: "learn", label: "Learn" },
];

const localUserId = "00000000-0000-4000-8000-000000000001";

const projectionSkeletonStyles = {
  shell: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 340px)",
    gap: 18,
  },
  main: {
    display: "grid",
    gap: 18,
  },
  thought: {
    display: "grid",
    gap: 12,
  },
  cluster: {
    display: "grid",
    gap: 12,
  },
  row: {
    display: "grid",
    gap: 8,
  },
  claim: {
    display: "grid",
    gap: 12,
    border: "var(--glass-border)",
    borderRadius: 8,
    padding: 16,
    background: "rgba(255, 253, 247, 0.07)",
  },
  graph: {
    position: "relative",
    minHeight: "var(--graph-area-min-height)",
    overflow: "hidden",
    border: "var(--glass-border)",
    borderRadius: 14,
    background:
      "radial-gradient(circle at 50% 46%, rgba(105, 185, 154, 0.18), transparent 9%), radial-gradient(circle at 28% 28%, rgba(131, 183, 216, 0.14), transparent 7%), radial-gradient(circle at 72% 30%, rgba(220, 140, 99, 0.12), transparent 7%), radial-gradient(circle at 26% 74%, rgba(255, 253, 247, 0.11), transparent 7%), radial-gradient(circle at 74% 72%, rgba(105, 185, 154, 0.12), transparent 7%), rgba(255, 253, 247, 0.045)",
  },
  graphRingOuter: {
    position: "absolute",
    inset: "24% 18%",
    border: "1px solid rgba(255, 253, 247, 0.1)",
    borderRadius: 999,
  },
  graphRingInner: {
    position: "absolute",
    inset: "35% 30%",
    border: "1px solid rgba(255, 253, 247, 0.1)",
    borderRadius: 999,
  },
  inspector: {
    display: "grid",
    gap: 12,
  },
} satisfies Record<string, CSSProperties>;

function toCommandMode(mode: WorkspaceMode): WorkspaceCommandMode {
  if (mode === "challenge") {
    return "Challenge";
  }

  if (mode === "learn") {
    return "Learn";
  }

  return "Brain";
}

function fromCommandMode(mode: WorkspaceCommandMode): WorkspaceMode {
  if (mode === "Challenge") {
    return "challenge";
  }

  if (mode === "Learn") {
    return "learn";
  }

  return "brain";
}

function readWorkspaceMode(value: string | null): WorkspaceMode | null {
  if (value === "brain" || value === "challenge" || value === "learn") {
    return value;
  }

  return null;
}

function getSessionIdForSelection(mode: WorkspaceMode, claimId: string | null) {
  return claimId ? `session-${claimId}` : `mode-${mode}`;
}

function createRequestId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
}

function hasBreadcrumbs(context: ShellContext | WorkspaceContext | null | undefined): context is ShellContext {
  return Boolean(context && ("breadcrumb" in context || "breadcrumbItems" in context));
}

function getBreadcrumbs(shell: ShellContext | null, view: ProjectionView | null): BreadcrumbItem[] {
  const viewContext =
    view && "workspaceContext" in view && view.workspaceContext
      ? view.workspaceContext
      : view && "shellContext" in view && view.shellContext
        ? view.shellContext
        : shell;

  if (hasBreadcrumbs(viewContext)) {
    return viewContext.breadcrumb ?? viewContext.breadcrumbItems ?? [];
  }

  return shell?.breadcrumb ?? shell?.breadcrumbItems ?? [];
}

function getProjectionContext(view: ProjectionView | null): ShellContext | WorkspaceContext | null {
  if (!view) {
    return null;
  }

  if ("workspaceContext" in view && view.workspaceContext) {
    return view.workspaceContext;
  }

  if ("shellContext" in view && view.shellContext) {
    return view.shellContext;
  }

  if ("currentContext" in view && view.currentContext) {
    return view.currentContext;
  }

  return null;
}

function getCurrentMapId(shell: ShellContext | null, view: ProjectionView | null) {
  const viewContext = getProjectionContext(view);

  if (shell?.mapId) {
    return shell.mapId;
  }

  if (viewContext?.mapId) {
    return viewContext.mapId;
  }

  if (view && "mapSummary" in view && view.mapSummary?.id) {
    return view.mapSummary.id;
  }

  if (view && "selectedMapId" in view && view.selectedMapId) {
    return view.selectedMapId;
  }

  return null;
}

function getCurrentClaimId(shell: ShellContext | null, view: ProjectionView | null) {
  const viewContext = getProjectionContext(view);

  if (shell?.claimId) {
    return shell.claimId;
  }

  if (viewContext?.claimId) {
    return viewContext.claimId;
  }

  if (view && "selectedClaim" in view && view.selectedClaim?.id) {
    return view.selectedClaim.id;
  }

  if (view && "activeClaim" in view && view.activeClaim?.id) {
    return view.activeClaim.id;
  }

  if (view && "selectedClaimId" in view && view.selectedClaimId) {
    return view.selectedClaimId;
  }

  return null;
}

function getActiveSessionId(mode: WorkspaceMode, shell: ShellContext | null, view: ProjectionView | null) {
  if (view && "activeChallengeRound" in view && view.activeChallengeRound?.id) {
    return `challenge-round-${view.activeChallengeRound.id}`;
  }

  const claimId = getCurrentClaimId(shell, view);

  if (claimId) {
    return `session-${claimId}`;
  }

  return `mode-${mode}`;
}

function formatConfidence(confidenceBps: number | null | undefined) {
  if (typeof confidenceBps !== "number") {
    return "No confidence";
  }

  return `${Math.round(confidenceBps / 100)}% confidence`;
}

function toCommandConfidence(confidenceBps: number | null | undefined) {
  return typeof confidenceBps === "number" ? Math.round(confidenceBps / 100) : null;
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return "Time not recorded";
  }

  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return "Time not recorded";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}

function getNodeLabel(graph: GraphModel, nodeId: string) {
  return graph.nodes.find((node) => node.id === nodeId)?.label ?? nodeId;
}

function selectedGraphNode(graph: GraphModel, selectedNodeId: string | null) {
  return graph.nodes.find((node) => node.id === selectedNodeId) ?? null;
}

function graphConnections(graph: GraphModel, selectedNodeId: string | null) {
  if (!selectedNodeId) {
    return [];
  }

  return graph.edges
    .filter((edge) => edge.source === selectedNodeId || edge.target === selectedNodeId)
    .map((edge) => {
      const otherNodeId = edge.source === selectedNodeId ? edge.target : edge.source;

      return {
        id: edge.id,
        title: getNodeLabel(graph, otherNodeId),
        detail: edge.label ?? "Connected in this map",
      };
    });
}

function recentActivityItems(view: BrainView) {
  const eventItems = (view.recentEvents ?? [])
    .map((event, index) => {
      if (typeof event !== "object" || event === null) {
        return null;
      }

      const record = event as Record<string, unknown>;
      const title =
        typeof record.type === "string"
          ? record.type
          : typeof record.eventType === "string"
            ? record.eventType
            : typeof record.name === "string"
              ? record.name
              : "Workspace event";
      const value =
        typeof record.updatedAt === "string"
          ? record.updatedAt
          : typeof record.updated_at === "string"
            ? record.updated_at
            : typeof record.createdAt === "string"
              ? record.createdAt
              : typeof record.created_at === "string"
                ? record.created_at
                : typeof record.timestamp === "string"
                  ? record.timestamp
                  : null;

      return {
        id: typeof record.id === "string" ? record.id : `event-${index + 1}`,
        title,
        detail: formatTimestamp(value),
      };
    })
    .filter((item): item is { id: string; title: string; detail: string } => Boolean(item));

  if (eventItems.length > 0) {
    return eventItems.slice(0, 4);
  }

  return [...view.claims]
    .sort((left, right) => new Date(right.updatedAt ?? 0).getTime() - new Date(left.updatedAt ?? 0).getTime())
    .slice(0, 4)
    .map((claim) => ({
      id: claim.id,
      title: claim.body,
      detail: `Updated ${formatTimestamp(claim.updatedAt)}`,
    }));
}

function createWorkspaceInspector(view: BrainView, graph: GraphModel, selectedNodeId: string | null) {
  const node = selectedGraphNode(graph, selectedNodeId);
  const selectedClaim = node?.kind === "claim" ? view.claims.find((claim) => claim.id === node.id) ?? view.selectedClaim : view.selectedClaim;
  const keyConnections = graphConnections(graph, selectedNodeId).slice(0, 4);
  const dependencies =
    node?.kind === "claim" && view.mapSummary
      ? [
          {
            id: `${view.mapSummary.id}:${node.id}`,
            title: view.mapSummary.title,
            detail: "Parent map dependency",
          },
        ]
      : keyConnections.filter((connection) => /contain|depend/i.test(connection.detail));
  const contradictionMarkers = view.claims
    .filter((claim) => typeof claim.confidenceBps === "number" && claim.confidenceBps < 6000)
    .slice(0, 3)
    .map((claim) => ({
      id: claim.id,
      title: claim.body,
      detail: `${formatConfidence(claim.confidenceBps)}; review as a contradiction risk.`,
    }));

  return {
    node,
    selectedClaim,
    keyConnections,
    dependencies,
    contradictionMarkers,
    recentActivity: recentActivityItems(view),
  };
}

function getMapTitle(shell: ShellContext | null, view: ProjectionView | null) {
  if (view && "mapSummary" in view && view.mapSummary?.title) {
    return view.mapSummary.title;
  }

  return getBreadcrumbs(shell, view).find((item) => item.kind === "map")?.label ?? "Current map";
}

function getMapClaimCount(view: ProjectionView | null) {
  if (view && "mapSummary" in view && view.mapSummary) {
    return view.mapSummary.claimCount;
  }

  return null;
}

function getSearchableClaims(view: ProjectionView | null) {
  const claimsById = new Map<string, ClaimView>();

  function addClaim(claim: ClaimView | null | undefined) {
    if (claim) {
      claimsById.set(claim.id, claim);
    }
  }

  if (view && "claims" in view) {
    view.claims.forEach(addClaim);
  }

  if (view && "selectedClaim" in view) {
    addClaim(view.selectedClaim);
  }

  if (view && "activeClaim" in view) {
    addClaim(view.activeClaim);
  }

  return Array.from(claimsById.values());
}

function buildCommandItems(input: {
  activeMode: WorkspaceMode;
  actionPending: boolean;
  onSelectClaim: (claimId: string, mapId?: string) => Promise<void>;
  onSelectMap: (mapId: string) => Promise<void>;
  onSwitchMode: (mode: WorkspaceMode) => Promise<void>;
  shell: ShellContext | null;
  view: ProjectionView | null;
}): CommandPaletteItem[] {
  const mapId = getCurrentMapId(input.shell, input.view);
  const mapTitle = getMapTitle(input.shell, input.view);
  const mapClaimCount = getMapClaimCount(input.view);
  const claims = getSearchableClaims(input.view);
  const items: CommandPaletteItem[] = modes.map((mode) => ({
    id: `session:${mode.id}`,
    type: "session",
    title: `${mode.label} session`,
    subtitle: mode.id === input.activeMode ? "Current session" : `Jump to ${mode.label}`,
    confidence: null,
    href: `/workspace?mode=${mode.id}`,
    keywords: [mode.id, mode.label, "mode", "workspace"],
    disabled: input.actionPending,
    onSelect: () => input.onSwitchMode(mode.id),
  }));

  if (mapId) {
    items.push({
      id: `map:${mapId}`,
      type: "map",
      title: mapTitle,
      subtitle: typeof mapClaimCount === "number" ? `${mapClaimCount} claims` : "Current workspace map",
      confidence: null,
      href: "/workspace?mode=brain",
      keywords: ["map", "brain", mapId],
      disabled: input.actionPending,
      onSelect: () => input.onSelectMap(mapId),
    });
  }

  claims.forEach((claim) => {
    const targetMapId = claim.mapId ?? mapId ?? undefined;
    const confidence = formatConfidence(claim.confidenceBps);

    items.push({
      id: `thought:${claim.id}`,
      type: "thought",
      title: claim.body,
      subtitle: `Thought - ${confidence}`,
      confidence: toCommandConfidence(claim.confidenceBps),
      href: "/workspace?mode=brain",
      keywords: ["claim", "thought", mapTitle, claim.id],
      disabled: input.actionPending || !targetMapId,
      onSelect: () => input.onSelectClaim(claim.id, targetMapId),
    });

    items.push({
      id: `claim:${claim.id}`,
      type: "claim",
      title: claim.body,
      subtitle: `Claim - ${confidence}`,
      confidence: toCommandConfidence(claim.confidenceBps),
      href: "/workspace?mode=brain",
      keywords: ["claim", "thought", mapTitle, claim.id],
      disabled: input.actionPending || !targetMapId,
      onSelect: () => input.onSelectClaim(claim.id, targetMapId),
    });
  });

  if (input.view && "activeChallengeRound" in input.view && input.view.activeChallengeRound) {
    const round = input.view.activeChallengeRound;

    items.push({
      id: `session:${round.id}`,
      type: "session",
      title: `Challenge round ${round.status}`,
      subtitle: "Recent challenge session",
      confidence: null,
      href: "/workspace?mode=challenge",
      keywords: ["challenge", "round", "session", round.id],
      disabled: input.actionPending,
      onSelect: () => input.onSwitchMode("challenge"),
    });
  }

  return items;
}

async function fetchProjection<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    headers: {
      "x-user-id": localUserId,
    },
    signal,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Projection request failed with ${response.status}.`);
  }

  return (await response.json()) as T;
}

async function postCommand<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-user-id": localUserId,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Command failed with ${response.status}.`);
  }

  return (await response.json()) as T;
}

function parseWorkspaceSelectionHref(href: string | null | undefined) {
  if (!href || typeof window === "undefined") {
    return null;
  }

  try {
    const url = new URL(href, window.location.origin);

    if (url.origin !== window.location.origin || url.pathname !== "/workspace") {
      return null;
    }

    const mapId = url.searchParams.get("mapId")?.trim();

    if (!mapId) {
      return null;
    }

    return {
      mode: readWorkspaceMode(url.searchParams.get("mode")) ?? "brain",
      mapId,
      claimId: url.searchParams.get("claimId")?.trim() || null,
    };
  } catch {
    return null;
  }
}

type PennyShellProps = {
  initialMode?: WorkspaceMode;
};

export function PennyShell({ initialMode = "brain" }: PennyShellProps) {
  const { currentMode: activeMode, setActiveSessionId, setCurrentMode, setSelectedNodeId } = useWorkspaceState();
  const [state, setState] = useState<ProjectionState>({
    isLoading: true,
    mode: initialMode,
    shell: null,
    view: null,
    error: null,
  });
  const [actionState, setActionState] = useState<ActionState>({
    status: "idle",
    message: null,
  });
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [isPending, startTransition] = useTransition();
  const syncWorkspaceSelection = useCallback(
    (selection: WorkspaceSelectionResult) => {
      const mode = fromCommandMode(selection.mode);
      const context = {
        mode,
        mapId: selection.mapId,
        claimId: selection.claimId,
      };

      setCurrentMode(mode);
      setSelectedNodeId(selection.claimId);
      setActiveSessionId(getSessionIdForSelection(mode, selection.claimId));
      setState((current) => {
        const shell = current.shell
          ? {
              ...current.shell,
              ...context,
            }
          : current.shell;
        let view = current.view;

        if (view && "currentContext" in view) {
          const selectedClaim = selection.claimId
            ? view.claims.find((claim) => claim.id === selection.claimId) ?? view.selectedClaim
            : null;

          view = {
            ...view,
            currentContext: {
              ...(view.currentContext ?? view.workspaceContext ?? context),
              ...context,
            },
            selectedClaim,
          };
        } else if (view && "workspaceContext" in view) {
          view = {
            ...view,
            workspaceContext: {
              ...(view.workspaceContext ?? context),
              ...context,
            },
          };
        }

        if (view && "selectedClaimId" in view) {
          view = {
            ...view,
            selectedMapId: selection.mapId,
            selectedClaimId: selection.claimId,
            selectedClaim: selection.claimId === view.selectedClaim?.id ? view.selectedClaim : null,
          };
        }

        return {
          ...current,
          mode,
          shell,
          view,
        };
      });
    },
    [setActiveSessionId, setCurrentMode, setSelectedNodeId],
  );
  const commandItems = buildCommandItems({
    activeMode,
    actionPending: actionState.status === "pending",
    onSelectClaim: selectClaim,
    onSelectMap: selectMap,
    onSwitchMode: switchMode,
    shell: state.shell,
    view: state.view,
  });
  const selectBackendSearchResult = useCallback(async (result: CommandResult) => {
    const parsedSelection = parseWorkspaceSelectionHref(result.href);

    if (!parsedSelection) {
      if (result.href) {
        window.location.assign(result.href);
      }

      return;
    }

    setActionState({
      status: "pending",
      message: "Opening search result.",
    });

    try {
      const workspaceSelection = await postCommand<WorkspaceSelectionResult>("/api/commands/workspace/select", {
        mode: toCommandMode(parsedSelection.mode),
        mapId: parsedSelection.mapId,
        claimId: parsedSelection.claimId,
        requestId: createRequestId("select-search-result"),
      });
      syncWorkspaceSelection(workspaceSelection);
      setActionState({
        status: "success",
        message: "Search result opened.",
      });
      setRefreshVersion((current) => current + 1);
      window.history.replaceState(null, "", result.href ?? `/workspace?mode=${parsedSelection.mode}`);
    } catch (error) {
      setActionState({
        status: "error",
        message: error instanceof Error ? error.message : "Failed to open search result.",
      });
    }
  }, [syncWorkspaceSelection]);
  const commandPalette = useCommandPalette({
    items: commandItems,
    onSelectBackendResult: selectBackendSearchResult,
  });

  useEffect(() => {
    setCurrentMode(initialMode);
  }, [initialMode, setCurrentMode]);

  useEffect(() => {
    function handleWorkspaceShortcut(event: KeyboardEvent) {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const modeByKey: Partial<Record<string, WorkspaceMode>> = {
        b: "brain",
        c: "challenge",
        l: "learn",
      };
      const nextMode = modeByKey[key];

      if (!nextMode || actionState.status === "pending") {
        return;
      }

      event.preventDefault();
      void switchMode(nextMode);
    }

    window.addEventListener("keydown", handleWorkspaceShortcut);

    return () => {
      window.removeEventListener("keydown", handleWorkspaceShortcut);
    };
  }, [actionState.status, switchMode]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadProjection() {
      try {
        setState((current) => ({
          ...current,
          isLoading: true,
          mode: activeMode,
          error: null,
        }));

        const shell = await fetchProjection<ShellContext>("/api/workspace/shell", controller.signal);
        const mode = activeMode || shell.mode || "brain";
        const view = await fetchProjection<ProjectionView>(`/api/workspace/${mode}`, controller.signal);

        startTransition(() => {
          setState({
            isLoading: false,
            mode,
            shell,
            view,
            error: null,
          });
          setCurrentMode(mode);
          setActiveSessionId(getActiveSessionId(mode, shell, view));
          setSelectedNodeId(getCurrentClaimId(shell, view));
        });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        startTransition(() => {
          setState((current) => ({
            ...current,
            isLoading: false,
            mode: activeMode,
            error: error instanceof Error ? error.message : "Projection request failed.",
          }));
        });
      }
    }

    loadProjection();

    return () => {
      controller.abort();
    };
  }, [activeMode, refreshVersion]);

  async function switchMode(mode: WorkspaceMode) {
    if (mode === activeMode && !state.error) {
      return;
    }

    const mapId = getCurrentMapId(state.shell, state.view);
    const claimId = getCurrentClaimId(state.shell, state.view);

    if (!mapId) {
      setActionState({
        status: "error",
        message: "Select or create a map before switching workspace modes.",
      });
      return;
    }

    setActionState({
      status: "pending",
      message: `Switching to ${toCommandMode(mode)}.`,
    });

    try {
      const selection = await postCommand<WorkspaceSelectionResult>("/api/commands/workspace/select", {
        mode: toCommandMode(mode),
        mapId,
        claimId,
        requestId: createRequestId("switch-mode"),
      });
      syncWorkspaceSelection(selection);
      setActionState({
        status: "success",
        message: `${toCommandMode(mode)} mode selected.`,
      });
      setRefreshVersion((current) => current + 1);
    } catch (error) {
      setActionState({
        status: "error",
        message: error instanceof Error ? error.message : "Failed to switch workspace mode.",
      });
    }
  }

  async function selectMap(mapId: string) {
    setActionState({
      status: "pending",
      message: "Updating selected map.",
    });

    try {
      const selection = await postCommand<WorkspaceSelectionResult>("/api/commands/workspace/select", {
        mode: toCommandMode(activeMode),
        mapId,
        claimId: null,
        requestId: createRequestId("select-map"),
      });
      syncWorkspaceSelection(selection);
      setActionState({
        status: "success",
        message: "Selected map updated.",
      });
      setRefreshVersion((current) => current + 1);
    } catch (error) {
      setActionState({
        status: "error",
        message: error instanceof Error ? error.message : "Failed to select map.",
      });
    }
  }

  async function selectClaim(claimId: string, targetMapId?: string) {
    const mapId = targetMapId ?? getCurrentMapId(state.shell, state.view);

    if (!mapId) {
      setActionState({
        status: "error",
        message: "Select or create a map before selecting a claim.",
      });
      return;
    }

    setActionState({
      status: "pending",
      message: "Updating selected claim.",
    });

    try {
      const selection = await postCommand<WorkspaceSelectionResult>("/api/commands/workspace/select", {
        mode: toCommandMode(activeMode),
        mapId,
        claimId,
        requestId: createRequestId("select-claim"),
      });
      syncWorkspaceSelection(selection);
      setActionState({
        status: "success",
        message: "Selected claim updated.",
      });
      setRefreshVersion((current) => current + 1);
    } catch (error) {
      setActionState({
        status: "error",
        message: error instanceof Error ? error.message : "Failed to select claim.",
      });
    }
  }

  async function createBrainClaim(text: string) {
    const mapId = state.shell?.mapId ?? (state.view && "mapSummary" in state.view ? state.view.mapSummary?.id : null);

    if (!mapId) {
      setActionState({
        status: "error",
        message: "Select or create a map before creating a claim.",
      });
      return;
    }

    setActionState({
      status: "pending",
      message: "Creating claim.",
    });

    try {
      const created = await postCommand<{ claimId: string }>("/api/commands/claims/create", {
        mapId,
        text,
        requestId: createRequestId("create-claim"),
      });

      const selection = await postCommand<WorkspaceSelectionResult>("/api/commands/workspace/select", {
        mode: "Brain",
        mapId,
        claimId: created.claimId,
        requestId: createRequestId("select-created-claim"),
      });
      syncWorkspaceSelection(selection);

      setActionState({
        status: "success",
        message: "Claim created and selected.",
      });
      setRefreshVersion((current) => current + 1);
    } catch (error) {
      setActionState({
        status: "error",
        message: error instanceof Error ? error.message : "Failed to create claim.",
      });
    }
  }

  async function startChallenge(claimId: string) {
    setActionState({
      status: "pending",
      message: "Starting challenge round.",
    });

    try {
      const started = await postCommand<{ roundId: string }>("/api/commands/challenge/start-round", {
        claimId,
        requestId: createRequestId("start-challenge"),
      });
      setActiveSessionId(`challenge-round-${started.roundId}`);
      setActionState({
        status: "success",
        message: "Challenge round started.",
      });
      setRefreshVersion((current) => current + 1);
    } catch (error) {
      setActionState({
        status: "error",
        message: error instanceof Error ? error.message : "Failed to start challenge round.",
      });
    }
  }

  async function requestCritique(roundId: string) {
    setActionState({
      status: "pending",
      message: "Requesting critique.",
    });

    try {
      await postCommand("/api/commands/challenge/request-critique", {
        roundId,
        requestId: createRequestId("request-critique"),
      });
      setActiveSessionId(`challenge-round-${roundId}`);
      setActionState({
        status: "success",
        message: "Critique requested.",
      });
      setRefreshVersion((current) => current + 1);
    } catch (error) {
      setActionState({
        status: "error",
        message: error instanceof Error ? error.message : "Failed to request critique.",
      });
    }
  }

  async function recordChallengeResponse(roundId: string, response: string, responsePath: ChallengeResponsePath = "defend") {
    setActionState({
      status: "pending",
      message: "Recording challenge response.",
    });

    try {
      await postCommand("/api/commands/challenge/respond", {
        roundId,
        response,
        responsePath,
        requestId: createRequestId("challenge-response"),
      });
      setActiveSessionId(`challenge-round-${roundId}`);
      setActionState({
        status: "success",
        message: "Challenge response recorded.",
      });
      setRefreshVersion((current) => current + 1);
    } catch (error) {
      setActionState({
        status: "error",
        message: error instanceof Error ? error.message : "Failed to record challenge response.",
      });
    }
  }

  const breadcrumbs = getBreadcrumbs(state.shell, state.view);

  return (
    <main className="penny-shell">
      <CommandPalette
        isOpen={commandPalette.isOpen}
        items={commandPalette.filteredItems}
        isLoading={commandPalette.backendSearchStatus === "loading"}
        onClose={commandPalette.close}
        onSelectItem={commandPalette.selectItem}
        query={commandPalette.query}
        setQuery={commandPalette.setQuery}
      />
      <header className="penny-topbar">
        <div className="penny-brand" aria-label="Penny">
          <span className="penny-brand-mark">P</span>
          <span className="penny-brand-name">Penny</span>
        </div>
        <button className="penny-command-button" type="button" onClick={commandPalette.open} aria-keyshortcuts="Meta+K Control+K /">
          <span>Search your brain…</span>
          <kbd>/</kbd>
        </button>
        <nav className="penny-mode-switcher" aria-label="Workspace mode">
          {modes.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className="penny-mode-button"
              data-active={activeMode === mode.id}
              disabled={actionState.status === "pending"}
              aria-keyshortcuts={mode.id.slice(0, 1)}
              onClick={() => {
                void switchMode(mode.id);
              }}
            >
              {mode.label}
            </button>
          ))}
        </nav>
      </header>

      <section className="penny-breadcrumb-band" aria-label="Workspace breadcrumb">
        <div className="penny-breadcrumbs">
          {breadcrumbs.length > 0 ? (
            breadcrumbs.map((item, index) => (
              <span key={item.id} className="penny-breadcrumb-item">
                {index > 0 ? <span className="penny-breadcrumb-separator">/</span> : null}
                <span>{item.label}</span>
              </span>
            ))
          ) : (
            <span className="penny-breadcrumb-empty">No workspace selected</span>
          )}
        </div>
        <span className="penny-context-label">Stored mode: {state.shell?.mode ?? "brain"}</span>
      </section>

      <section className="penny-main-content" aria-busy={state.isLoading || isPending}>
        {state.error ? (
          <ErrorState
            actionLabel="Retry"
            message="Penny could not load this workspace view. Retry the projection, or switch modes if the workspace is still starting up."
            onAction={() => setRefreshVersion((current) => current + 1)}
            technicalDetail={state.error}
            title="Projection unavailable"
          />
        ) : null}
        {!state.error && state.isLoading && !state.view ? (
          <ProjectionSkeleton />
        ) : null}
        {!state.error && state.isLoading && state.view ? (
          <ProjectionNotice title="Updating projection" body="Refreshing the workspace view while preserving the current selection." />
        ) : null}
        {!state.error && !state.isLoading && !state.view ? (
          <EmptyState
            actionLabel="Retry"
            body="The workspace API responded, but no projection was available for the selected mode."
            onAction={() => setRefreshVersion((current) => current + 1)}
            title="No workspace projection"
          />
        ) : null}
        {!state.error && state.view ? (
          <ProjectionContent
            actionState={actionState}
            mode={state.mode}
            onCreateClaim={createBrainClaim}
            onRecordChallengeResponse={recordChallengeResponse}
            onRequestCritique={requestCritique}
            onSelectClaim={selectClaim}
            onStartChallenge={startChallenge}
            view={state.view}
          />
        ) : null}
      </section>
    </main>
  );
}

function ProjectionSkeleton() {
  return (
    <div style={projectionSkeletonStyles.shell} role="status" aria-label="Loading workspace projection">
      <div style={projectionSkeletonStyles.main}>
        <section className="penny-panel penny-hero-panel" style={projectionSkeletonStyles.thought} aria-label="Loading thoughts">
          <Skeleton height={12} width={72} label="Loading thought label" />
          <Skeleton height={40} width="72%" label="Loading thought title" />
          <Skeleton height={16} width="88%" label="Loading thought summary" />
          <Skeleton height={16} width="62%" label="Loading thought metadata" />
        </section>

        <section className="penny-panel penny-graph-panel" aria-label="Loading graph">
          <div className="penny-panel-heading">
            <div style={projectionSkeletonStyles.cluster}>
              <Skeleton height={12} width={64} label="Loading graph label" />
              <Skeleton height={22} width={160} label="Loading graph title" />
            </div>
            <Skeleton height={14} width={128} label="Loading graph selected node" />
          </div>
          <div style={projectionSkeletonStyles.graph}>
            <span style={projectionSkeletonStyles.graphRingOuter} />
            <span style={projectionSkeletonStyles.graphRingInner} />
          </div>
        </section>

        <section className="penny-panel" aria-label="Loading claims">
          <p className="penny-kicker">Claims</p>
          <div className="penny-list">
            {Array.from({ length: 4 }).map((_, index) => (
              <div style={projectionSkeletonStyles.claim} key={index}>
                <Skeleton height={16} width="88%" label="Loading claim body" />
                <Skeleton height={16} width="64%" label="Loading claim preview" />
                <Skeleton height={24} width={124} label="Loading claim confidence" />
              </div>
            ))}
          </div>
        </section>
      </div>

      <aside className="penny-panel" style={projectionSkeletonStyles.inspector} aria-label="Loading inspector">
        <Skeleton height={12} width={86} label="Loading inspector label" />
        <Skeleton height={24} width="70%" label="Loading inspector title" />
        {Array.from({ length: 6 }).map((_, index) => (
          <span style={projectionSkeletonStyles.row} key={index}>
            <Skeleton height={12} width="38%" label="Loading inspector field" />
            <Skeleton height={16} width="76%" label="Loading inspector value" />
          </span>
        ))}
      </aside>
    </div>
  );
}

function ProjectionNotice({ title, body }: { title: string; body: string }) {
  return (
    <div className="penny-panel penny-notice">
      <p className="penny-kicker">{title}</p>
      <p>{body}</p>
    </div>
  );
}

function ProjectionContent({
  actionState,
  mode,
  onCreateClaim,
  onRecordChallengeResponse,
  onRequestCritique,
  onSelectClaim,
  onStartChallenge,
  view,
}: {
  actionState: ActionState;
  mode: WorkspaceMode;
  onCreateClaim: (text: string) => Promise<void>;
  onRecordChallengeResponse: (roundId: string, response: string, responsePath: ChallengeResponsePath) => Promise<void>;
  onRequestCritique: (roundId: string) => Promise<void>;
  onSelectClaim: (claimId: string) => Promise<void>;
  onStartChallenge: (claimId: string) => Promise<void>;
  view: ProjectionView;
}) {
  if (mode === "challenge") {
    return (
      <ChallengeExperience
        actionState={actionState}
        onRecordResponse={onRecordChallengeResponse}
        onRequestCritique={onRequestCritique}
        onStartChallenge={onStartChallenge}
        view={view as ChallengeView}
      />
    );
  }

  if (mode === "learn") {
    return <LearnExperience view={view as LearnView} />;
  }

  return (
    <BrainProjection
      actionState={actionState}
      onCreateClaim={onCreateClaim}
      onSelectClaim={onSelectClaim}
      view={view as BrainView}
    />
  );
}

function BrainProjection({
  actionState,
  onCreateClaim,
  onSelectClaim,
  view,
}: {
  actionState: ActionState;
  onCreateClaim: (text: string) => Promise<void>;
  onSelectClaim: (claimId: string) => Promise<void>;
  view: BrainView;
}) {
  const { selectedNodeId: storedSelectedNodeId, setSelectedNodeId } = useWorkspaceState();
  const mapTitle = view.mapSummary?.title ?? "Workspace projection";
  const graph = useMemo(() => createBrainGraph(view as Parameters<typeof createBrainGraph>[0]), [view]);
  const selectedNodeId = storedSelectedNodeId ?? graph.selectedNodeId ?? null;
  const inspector = createWorkspaceInspector(view, graph, selectedNodeId);

  function inspectGraphNode(node: GraphNode) {
    setSelectedNodeId(node.id);

    if (node.kind === "claim") {
      void onSelectClaim(node.id);
    }
  }

  return (
    <div className="penny-workspace-grid">
      <div className="penny-workspace-main">
        <section className="penny-panel penny-hero-panel">
          <p className="penny-kicker">Brain</p>
          <h1>{mapTitle}</h1>
          <p>
            {view.mapSummary
              ? `${view.mapSummary.claimCount} claims loaded from the Brain projection.`
              : "Create or select a map to populate this projection."}
          </p>
        </section>

        <section className="penny-panel penny-graph-panel" id="brain-map">
          <div className="penny-panel-heading">
            <div>
              <p className="penny-kicker">Graph</p>
              <h2>Claim map</h2>
            </div>
            <span>{selectedNodeId ? `Inspecting ${selectedNodeId}` : "No node selected"}</span>
          </div>
          <BrainGraphMap graph={graph} selectedNodeId={selectedNodeId} onSelectNode={inspectGraphNode} height={520} />
        </section>

        <section className="penny-panel">
          <p className="penny-kicker">Claims</p>
          {actionState.message ? (
            <p className="penny-action-message" data-status={actionState.status}>
              {actionState.message}
            </p>
          ) : null}
          {view.claims.length > 0 ? (
            <div className="penny-list">
              {view.claims.map((claim) => (
                <button
                  key={claim.id}
                  type="button"
                  className="penny-claim-button"
                  data-selected={selectedNodeId === claim.id}
                  onClick={() => {
                    setSelectedNodeId(claim.id);
                    void onSelectClaim(claim.id);
                  }}
                >
                  <ClaimSummary claim={claim} />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              body="This Brain map is ready, but it does not have any projected claims yet. Create a claim below to start the stream."
              title="No claims in this Brain map"
            />
          )}
        </section>

        <section className="penny-panel">
          <p className="penny-kicker">Create claim</p>
          <ClaimComposer disabled={!view.mapSummary || actionState.status === "pending"} onSubmit={onCreateClaim} />
        </section>
      </div>

      <InspectorRail
        activity={inspector.recentActivity}
        ariaLabel="Brain inspector"
        className="penny-inspector-rail"
        connections={inspector.keyConnections}
        contradictions={inspector.contradictionMarkers.map((marker) => ({ ...marker, severity: "medium" as const }))}
        dependencies={inspector.dependencies}
        selectedTitle={inspector.node?.label ?? "No node selected"}
      >
        <dl className="penny-facts">
          <div>
            <dt>Node type</dt>
            <dd>{inspector.node?.kind ?? "None"}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{inspector.node?.status ?? "No status"}</dd>
          </div>
          <div>
            <dt>Confidence</dt>
            <dd>
              <ConfidenceChip scale="basis-points" value={inspector.selectedClaim?.confidenceBps} />
            </dd>
          </div>
        </dl>
        <div style={{ marginTop: 16 }}>
          <p className="penny-kicker">Selected claim</p>
          {inspector.selectedClaim ? <ClaimSummary claim={inspector.selectedClaim} /> : <p>No claim selected.</p>}
        </div>
      </InspectorRail>
    </div>
  );
}

function ClaimSummary({ claim }: { claim: ClaimView }) {
  return (
    <article className="penny-claim">
      <p>{claim.body}</p>
      <ConfidenceChip scale="basis-points" value={claim.confidenceBps} />
    </article>
  );
}

function ClaimComposer({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (text: string) => Promise<void>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");

  useEffect(() => {
    if (!disabled) {
      textareaRef.current?.focus();
    }
  }, [disabled]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = text.trim();

    if (!trimmed || disabled) {
      return;
    }

    await onSubmit(trimmed);
    setText("");
  }

  return (
    <form ref={formRef} className="penny-claim-form" onSubmit={handleSubmit}>
      <label htmlFor="claim-text">Claim</label>
      <textarea
        ref={textareaRef}
        id="claim-text"
        name="claim"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            formRef.current?.requestSubmit();
          }
        }}
        disabled={disabled}
        autoFocus
        rows={4}
      />
      <button type="submit" disabled={disabled || !text.trim()} aria-keyshortcuts="Meta+Enter Control+Enter">
        Create claim
      </button>
    </form>
  );
}
