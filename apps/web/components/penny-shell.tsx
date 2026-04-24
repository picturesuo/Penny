"use client";

import { useEffect, useState, useTransition } from "react";

type WorkspaceMode = "brain" | "challenge" | "learn";

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
    provider?: string;
    model?: string;
    promptVersion?: string;
  };
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
};

type ProjectionView = BrainView | ChallengeView | LearnView;

type ProjectionState = {
  mode: WorkspaceMode;
  shell: ShellContext | null;
  view: ProjectionView | null;
  error: string | null;
};

const modes: Array<{ id: WorkspaceMode; label: string }> = [
  { id: "brain", label: "Brain" },
  { id: "challenge", label: "Challenge" },
  { id: "learn", label: "Learn" },
];

const localUserId = "00000000-0000-4000-8000-000000000001";

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

export function PennyShell() {
  const [activeMode, setActiveMode] = useState<WorkspaceMode>("brain");
  const [state, setState] = useState<ProjectionState>({
    mode: "brain",
    shell: null,
    view: null,
    error: null,
  });
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
  }, [activeMode]);

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
              onClick={() => setActiveMode(mode.id)}
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
        {!state.error && state.view ? <ProjectionContent mode={state.mode} view={state.view} /> : null}
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

function ProjectionContent({ mode, view }: { mode: WorkspaceMode; view: ProjectionView }) {
  if (mode === "challenge") {
    return <ChallengeProjection view={view as ChallengeView} />;
  }

  if (mode === "learn") {
    return <LearnProjection view={view as LearnView} />;
  }

  return <BrainProjection view={view as BrainView} />;
}

function BrainProjection({ view }: { view: BrainView }) {
  return (
    <div className="penny-content-grid">
      <section className="penny-panel penny-hero-panel">
        <p className="penny-kicker">Brain</p>
        <h1>{view.mapSummary?.title ?? "Workspace projection"}</h1>
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
        {view.claims.length > 0 ? (
          <div className="penny-list">
            {view.claims.map((claim) => (
              <ClaimSummary key={claim.id} claim={claim} />
            ))}
          </div>
        ) : (
          <p>No claims returned by the Brain projection.</p>
        )}
      </section>
    </div>
  );
}

function ChallengeProjection({ view }: { view: ChallengeView }) {
  return (
    <div className="penny-content-grid">
      <section className="penny-panel penny-hero-panel">
        <p className="penny-kicker">Challenge</p>
        <h1>{view.activeClaim?.body ?? "No active claim"}</h1>
        <p>Critique status: {view.critiqueStatus}</p>
      </section>

      <section className="penny-panel">
        <p className="penny-kicker">Latest round</p>
        {view.activeChallengeRound ? (
          <dl className="penny-facts">
            <div>
              <dt>Round</dt>
              <dd>{view.activeChallengeRound.id}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{view.activeChallengeRound.status}</dd>
            </div>
          </dl>
        ) : (
          <p>No challenge round returned.</p>
        )}
      </section>

      <section className="penny-panel penny-wide-panel">
        <p className="penny-kicker">Critique</p>
        {view.critiqueState?.body ? <p className="penny-critique-body">{view.critiqueState.body}</p> : <p>No critique body returned.</p>}
      </section>
    </div>
  );
}

function LearnProjection({ view }: { view: LearnView }) {
  return (
    <div className="penny-content-grid">
      <section className="penny-panel penny-hero-panel">
        <p className="penny-kicker">Learn</p>
        <h1>{view.learnState.message}</h1>
        <p>Status: {view.status}</p>
      </section>

      <section className="penny-panel">
        <p className="penny-kicker">Selected claim</p>
        {view.selectedClaim ? <ClaimSummary claim={view.selectedClaim} /> : <p>No claim selected.</p>}
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
