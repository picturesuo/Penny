"use client";

import { useEffect, useState, useTransition } from "react";

import { ChallengeExperience, type ChallengeResponsePath } from "./challenge/challenge-experience";
import { LearnExperience } from "./learn/learn-experience";

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

export function PennyShell() {
  const [activeMode, setActiveMode] = useState<WorkspaceMode>("brain");
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

  async function selectClaim(claimId: string) {
    const mapId = getCurrentMapId(state.shell, state.view);

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
      <header className="penny-topbar">
        <div className="penny-brand" aria-label="Penny">
          <span className="penny-brand-mark">P</span>
          <span className="penny-brand-name">Penny</span>
        </div>
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

  return (
    <div className="penny-content-grid">
      <section className="penny-panel penny-hero-panel">
        <p className="penny-kicker">Brain</p>
        <h1>{mapTitle}</h1>
        <p>
          {view.mapSummary
            ? `${view.mapSummary.claimCount} claims loaded from the Brain projection.`
            : "Create or select a map to populate this projection."}
        </p>
      </section>

      <section className="penny-panel">
        <p className="penny-kicker">Selected claim</p>
        {view.selectedClaim ? <ClaimSummary claim={view.selectedClaim} /> : <p>No claim selected.</p>}
      </section>

      <section className="penny-panel penny-wide-panel">
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
                onClick={() => onSelectClaim(claim.id)}
              >
                <ClaimSummary claim={claim} />
              </button>
            ))}
          </div>
        ) : (
          <p>No claims returned by the Brain projection.</p>
        )}
      </section>

      <section className="penny-panel penny-wide-panel">
        <p className="penny-kicker">Create claim</p>
        <ClaimComposer disabled={!view.mapSummary || actionState.status === "pending"} onSubmit={onCreateClaim} />
      </section>
    </div>
  );
}

function ClaimSummary({ claim }: { claim: ClaimView }) {
  return (
    <article className="penny-claim">
      <p>{claim.body}</p>
      <span>{formatConfidence(claim.confidenceBps)}</span>
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
