"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import { ChallengeExperience, type ChallengeResponsePath } from "./challenge/challenge-experience";
import { ConfidenceChip } from "./confidence/ConfidenceChip";
import { BrainGraphMap, createBrainGraph } from "./graph";
import { LearnExperience } from "./learn/learn-experience";
import type { GraphModel, GraphNode } from "../lib/types/graph";
import { CommandPalette } from "../src/components/command/CommandPalette";
import { InspectorRail } from "../src/components/inspector/InspectorRail";
import { useCommandPalette, type CommandPaletteItem } from "../src/hooks/useCommandPalette";

type WorkspaceMode = "brain" | "challenge" | "learn";
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
  mode: WorkspaceMode;
  shell: ShellContext | null;
  view: ProjectionView | null;
  error: string | null;
};

type ActionState = {
  status: "idle" | "pending" | "success" | "error";
  message: string | null;
};

const modes: Array<{ id: WorkspaceMode; label: string }> = [
  { id: "brain", label: "Brain" },
  { id: "challenge", label: "Challenge" },
  { id: "learn", label: "Learn" },
];

const localUserId = "00000000-0000-4000-8000-000000000001";

function toCommandMode(mode: WorkspaceMode): WorkspaceCommandMode {
  if (mode === "challenge") {
    return "Challenge";
  }

  if (mode === "learn") {
    return "Learn";
  }

  return "Brain";
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

type PennyShellProps = {
  initialMode?: WorkspaceMode;
};

export function PennyShell({ initialMode = "brain" }: PennyShellProps) {
  const [activeMode, setActiveMode] = useState<WorkspaceMode>(initialMode);
  const [state, setState] = useState<ProjectionState>({
    mode: "brain",
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
  const commandItems = buildCommandItems({
    activeMode,
    actionPending: actionState.status === "pending",
    onSelectClaim: selectClaim,
    onSelectMap: selectMap,
    onSwitchMode: switchMode,
    shell: state.shell,
    view: state.view,
  });
  const commandPalette = useCommandPalette({ items: commandItems });

  useEffect(() => {
    setActiveMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadProjection() {
      try {
        const shell = await fetchProjection<ShellContext>("/api/workspace/shell", controller.signal);
        const mode = activeMode || shell.mode || "brain";
        const view = await fetchProjection<ProjectionView>(`/api/workspace/${mode}`, controller.signal);

        startTransition(() => {
          setState({
            mode,
            shell,
            view,
            error: null,
          });
        });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        startTransition(() => {
          setState((current) => ({
            ...current,
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
      await postCommand("/api/commands/workspace/select", {
        mode: toCommandMode(mode),
        mapId,
        claimId,
        requestId: createRequestId("switch-mode"),
      });
      setActiveMode(mode);
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
      await postCommand("/api/commands/workspace/select", {
        mode: toCommandMode(activeMode),
        mapId,
        claimId: null,
        requestId: createRequestId("select-map"),
      });
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
      await postCommand("/api/commands/workspace/select", {
        mode: toCommandMode(activeMode),
        mapId,
        claimId,
        requestId: createRequestId("select-claim"),
      });
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

      await postCommand("/api/commands/workspace/select", {
        mode: "Brain",
        mapId,
        claimId: created.claimId,
        requestId: createRequestId("select-created-claim"),
      });

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
      await postCommand("/api/commands/challenge/start-round", {
        claimId,
        requestId: createRequestId("start-challenge"),
      });
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
        <button className="penny-command-button" type="button" onClick={commandPalette.open}>
          <span>Search your brain…</span>
          <kbd>Cmd/Ctrl K</kbd>
        </button>
        <nav className="penny-mode-switcher" aria-label="Workspace mode">
          {modes.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className="penny-mode-button"
              data-active={activeMode === mode.id}
              disabled={actionState.status === "pending"}
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

      <section className="penny-main-content" aria-busy={isPending}>
        {state.error ? <ProjectionNotice title="Projection unavailable" body={state.error} /> : null}
        {!state.error && !state.view ? <ProjectionNotice title="Loading projection" body="Reading workspace state." /> : null}
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
  const mapTitle = view.mapSummary?.title ?? "Workspace projection";
  const graph = useMemo(() => createBrainGraph(view as Parameters<typeof createBrainGraph>[0]), [view]);
  const [inspectedNodeId, setInspectedNodeId] = useState<string | null>(null);
  const inspectedNodeExists = graph.nodes.some((node) => node.id === inspectedNodeId);
  const selectedNodeId = inspectedNodeExists ? inspectedNodeId : graph.selectedNodeId ?? null;
  const inspector = createWorkspaceInspector(view, graph, selectedNodeId);

  function inspectGraphNode(node: GraphNode) {
    setInspectedNodeId(node.id);

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
                  data-selected={view.selectedClaim?.id === claim.id}
                  onClick={() => {
                    setInspectedNodeId(claim.id);
                    void onSelectClaim(claim.id);
                  }}
                >
                  <ClaimSummary claim={claim} />
                </button>
              ))}
            </div>
          ) : (
            <p>No claims returned by the Brain projection.</p>
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
  const [text, setText] = useState("");

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
    <form className="penny-claim-form" onSubmit={handleSubmit}>
      <label htmlFor="claim-text">Claim</label>
      <textarea
        id="claim-text"
        name="claim"
        value={text}
        onChange={(event) => setText(event.target.value)}
        disabled={disabled}
        rows={4}
      />
      <button type="submit" disabled={disabled || !text.trim()}>
        Create claim
      </button>
    </form>
  );
}
