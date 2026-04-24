import React, { type CSSProperties } from "react";
import { ConfidenceChip } from "../confidence/ConfidenceChip";
import type { BrainThoughtViewModel, BrainViewModel } from "../../lib/viewmodels/brain";

type BrainScreenProps = {
  activeMode?: "brain" | "challenge" | "learn";
  model: BrainViewModel;
  interactionMessage?: string | null;
  state?: "empty" | "error" | "loading" | "populated";
  statusMessage?: string | null;
  technicalDetail?: string | null;
  onChangeMode?: (mode: "brain" | "challenge" | "learn") => void;
  onNewThought?: () => void;
  onRetry?: () => void;
  onSelectThought?: (thoughtId: string) => void;
};

const workspaceModes = [
  { id: "brain", label: "Brain" },
  { id: "challenge", label: "Challenge" },
  { id: "learn", label: "Learn" },
] as const;

const firstThoughtPrompt =
  "Penny should help me trace one product belief from thought to claim, pressure, and what changed.";
const samplePrompts = [
  "I think Penny should sharpen judgment, not just store notes.",
  "Put this architecture idea under pressure.",
  "Find what this idea depends on.",
] as const;

const styles = {
  shell: {
    minHeight: "100vh",
    background: "var(--color-canvas)",
    color: "var(--penny-ink)",
  },
  header: {
    borderBottom: "var(--border-subtle)",
    background: "var(--glass-panel), rgba(13, 18, 16, 0.72)",
    backdropFilter: "var(--glass-blur)",
    padding: "20px clamp(18px, 4vw, 40px)",
  },
  brandRow: {
    alignItems: "center",
    display: "flex",
    gap: 14,
    justifyContent: "space-between",
    marginBottom: 18,
  },
  titleGroup: {
    minWidth: 0,
  },
  eyebrow: {
    color: "var(--penny-accent-strong)",
    fontSize: "var(--type-section-label-size)",
    fontWeight: "var(--type-section-label-weight)",
    letterSpacing: 0,
    margin: 0,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 32,
    lineHeight: 1.1,
    margin: "4px 0 0",
  },
  contextGrid: {
    display: "grid",
    gap: 10,
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  },
  toolbar: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 16,
  },
  modeSwitcher: {
    display: "inline-grid",
    gap: 4,
    gridTemplateColumns: "repeat(3, minmax(86px, 1fr))",
  },
  modeButton: {
    background: "rgba(255, 253, 247, 0.08)",
    border: "var(--glass-border)",
    borderRadius: 6,
    color: "var(--penny-muted)",
    cursor: "pointer",
    minHeight: 36,
    padding: "0 12px",
  },
  modeButtonSelected: {
    background: "var(--penny-accent)",
    borderColor: "var(--penny-accent)",
    color: "var(--color-canvas)",
  },
  primaryButton: {
    background: "var(--penny-ink)",
    border: 0,
    borderRadius: 6,
    color: "var(--color-canvas)",
    cursor: "pointer",
    fontWeight: 750,
    minHeight: 36,
    padding: "0 14px",
  },
  contextItem: {
    border: "var(--glass-border)",
    borderRadius: 8,
    background: "rgba(255, 253, 247, 0.07)",
    padding: 14,
  },
  contextLabel: {
    color: "var(--penny-muted)",
    display: "block",
    fontSize: 12,
    marginBottom: 4,
  },
  contextValue: {
    display: "block",
    fontWeight: 750,
    overflowWrap: "anywhere",
  },
  main: {
    display: "grid",
    gap: 18,
    gridTemplateColumns: "minmax(280px, 1.25fr) minmax(280px, 0.75fr)",
    padding: "24px clamp(18px, 4vw, 40px) 44px",
  },
  panel: {
    background: "var(--glass-panel), rgba(23, 32, 27, 0.68)",
    border: "var(--glass-border)",
    borderRadius: 8,
    boxShadow: "var(--glass-shadow)",
    padding: 18,
  },
  stack: {
    display: "grid",
    gap: 12,
  },
  list: {
    display: "grid",
    gap: 10,
    margin: 0,
    padding: 0,
  },
  listItem: {
    listStyle: "none",
  },
  thoughtButton: {
    background: "transparent",
    border: 0,
    borderRadius: 8,
    color: "inherit",
    cursor: "pointer",
    display: "block",
    padding: 0,
    textAlign: "left",
    width: "100%",
  },
  thoughtCard: {
    background: "rgba(255, 253, 247, 0.07)",
    border: "var(--glass-border)",
    borderRadius: 8,
    padding: 16,
  },
  thoughtRow: {
    alignItems: "start",
    display: "grid",
    gap: 14,
    gridTemplateColumns: "minmax(0, 1fr) 96px",
  },
  thoughtCopy: {
    minWidth: 0,
  },
  thoughtCardSelected: {
    borderColor: "var(--penny-accent)",
    boxShadow: "inset 4px 0 0 var(--penny-accent)",
  },
  thoughtTitle: {
    fontSize: 17,
    lineHeight: 1.35,
    margin: 0,
  },
  thoughtBody: {
    color: "var(--penny-muted)",
    lineHeight: 1.55,
    margin: "8px 0 0",
  },
  metadata: {
    alignItems: "center",
    color: "var(--penny-blue)",
    display: "flex",
    flexWrap: "wrap",
    fontSize: 13,
    gap: 10,
    marginTop: 12,
  },
  confidenceGraph: {
    alignSelf: "stretch",
    display: "grid",
    gap: 4,
    gridTemplateColumns: "repeat(5, 1fr)",
    minHeight: 42,
  },
  confidenceBar: {
    alignSelf: "end",
    background: "rgba(255, 253, 247, 0.14)",
    borderRadius: 3,
    display: "block",
    minHeight: 8,
  },
  confidenceBarActive: {
    background: "var(--penny-accent)",
  },
  sideRail: {
    display: "grid",
    gap: 18,
  },
  selectedCard: {
    background: "rgba(255, 253, 247, 0.07)",
    border: "var(--glass-border)",
    borderRadius: 8,
    padding: 18,
  },
  selectedPanel: {
    display: "grid",
    gap: 16,
  },
  selectedActions: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
  },
  actionLink: {
    background: "var(--penny-ink)",
    borderRadius: 6,
    color: "var(--color-canvas)",
    display: "inline-flex",
    fontSize: 14,
    fontWeight: 750,
    minHeight: 36,
    padding: "8px 12px",
    textDecoration: "none",
  },
  relatedList: {
    display: "grid",
    gap: 8,
    margin: 0,
    padding: 0,
  },
  relatedItem: {
    listStyle: "none",
  },
  relatedLink: {
    border: "var(--glass-border)",
    borderRadius: 8,
    color: "inherit",
    display: "block",
    padding: 12,
    textDecoration: "none",
  },
  affordanceButton: {
    background: "rgba(255, 253, 247, 0.07)",
    border: "var(--glass-border)",
    borderRadius: 8,
    color: "inherit",
    cursor: "pointer",
    display: "block",
    padding: 12,
    textAlign: "left",
    width: "100%",
  },
  affordanceButtonSelected: {
    borderColor: "var(--penny-accent)",
    boxShadow: "inset 4px 0 0 var(--penny-accent)",
  },
  affordanceTitle: {
    display: "block",
    fontWeight: 800,
    overflowWrap: "anywhere",
  },
  affordanceDescription: {
    color: "var(--penny-muted)",
    display: "block",
    fontSize: 13,
    lineHeight: 1.45,
    marginTop: 4,
    overflowWrap: "anywhere",
  },
  facts: {
    display: "grid",
    gap: 10,
    margin: "12px 0 0",
  },
  factRow: {
    display: "grid",
    gap: 3,
  },
  factLabel: {
    color: "var(--penny-muted)",
    fontSize: 12,
  },
  factValue: {
    margin: 0,
    overflowWrap: "anywhere",
  },
  inspectorGroup: {
    display: "grid",
    gap: 8,
    marginTop: 14,
  },
  inspectorList: {
    display: "grid",
    gap: 8,
    margin: 0,
    padding: 0,
  },
  inspectorItem: {
    background: "rgba(255, 253, 247, 0.07)",
    border: "var(--glass-border)",
    borderRadius: 8,
    listStyle: "none",
    padding: 10,
  },
  inspectorItemWarning: {
    borderColor: "rgba(227, 147, 134, 0.32)",
    boxShadow: "inset 3px 0 0 var(--color-danger)",
  },
  inspectorItemTitle: {
    display: "block",
    fontWeight: 800,
    overflowWrap: "anywhere",
  },
  inspectorItemDetail: {
    color: "var(--penny-muted)",
    display: "block",
    fontSize: 13,
    lineHeight: 1.45,
    marginTop: 4,
    overflowWrap: "anywhere",
  },
  emptyState: {
    border: "1px dashed var(--color-line-strong)",
    borderRadius: 8,
    color: "var(--penny-muted)",
    margin: 0,
    padding: 18,
  },
  firstRunState: {
    background: "rgba(255, 253, 247, 0.07)",
    border: "var(--glass-border)",
    borderRadius: 8,
    display: "grid",
    gap: 14,
    marginTop: 14,
    padding: 18,
  },
  firstRunPrompt: {
    background: "rgba(255, 253, 247, 0.08)",
    border: "var(--glass-border)",
    borderRadius: 8,
    color: "var(--penny-ink)",
    lineHeight: 1.55,
    margin: 0,
    padding: 14,
  },
  firstRunSteps: {
    display: "grid",
    gap: 8,
    margin: 0,
    padding: 0,
  },
  firstRunStep: {
    listStyle: "none",
  },
  samplePromptList: {
    display: "grid",
    gap: 8,
    margin: 0,
    padding: 0,
  },
  samplePromptItem: {
    background: "rgba(255, 253, 247, 0.07)",
    border: "var(--glass-border)",
    borderRadius: 8,
    color: "var(--penny-ink)",
    lineHeight: 1.45,
    listStyle: "none",
    padding: 12,
  },
  status: {
    color: "var(--penny-muted)",
    margin: "12px 0 0",
  },
  stateBanner: {
    border: "var(--glass-border)",
    borderRadius: 8,
    margin: "0 0 14px",
    padding: 14,
  },
  stateBannerLoading: {
    background: "rgba(131, 183, 216, 0.12)",
    color: "var(--color-mode-learn-ink)",
  },
  stateBannerError: {
    background: "rgba(227, 147, 134, 0.12)",
    borderColor: "rgba(227, 147, 134, 0.32)",
    color: "var(--color-danger)",
  },
  stateBannerEmpty: {
    background: "rgba(255, 253, 247, 0.07)",
    color: "var(--penny-muted)",
  },
  stateBannerPopulated: {
    background: "var(--color-mode-brain-soft)",
    color: "var(--color-mode-brain-ink)",
  },
  stateTitle: {
    fontSize: 14,
    fontWeight: 800,
    margin: 0,
  },
  stateBody: {
    lineHeight: 1.5,
    margin: "4px 0 0",
  },
  stateTechnicalDetail: {
    margin: "10px 0 0",
  },
  stateTechnicalSummary: {
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 800,
  },
} satisfies Record<string, CSSProperties>;

export function BrainScreen({
  activeMode = "brain",
  interactionMessage,
  model,
  onChangeMode,
  onNewThought,
  onRetry,
  onSelectThought,
  state,
  statusMessage,
  technicalDetail,
}: BrainScreenProps) {
  const screenState = state ?? (model.stream.length > 0 ? "populated" : "empty");

  return (
    <main style={styles.shell}>
      <header style={styles.header}>
        <div style={styles.brandRow}>
          <div style={styles.titleGroup}>
            <p style={styles.eyebrow}>Brain</p>
            <h1 style={styles.title}>Thought stream</h1>
          </div>
          <strong>{model.context.claimCountLabel}</strong>
        </div>
        <section aria-label="Map and sphere context" style={styles.contextGrid}>
          <ContextValue label="Map" value={model.context.mapTitle} />
          <ContextValue label="Map ID" value={model.context.mapId ?? "No map selected"} />
          <ContextValue label="Sphere" value={model.context.sphereLabel} />
          <ContextValue label="Selected thought" value={model.context.claimId ?? "No thought selected"} />
        </section>
        <div aria-label="Brain actions" style={styles.toolbar}>
          <div aria-label="Workspace mode" style={styles.modeSwitcher}>
            {workspaceModes.map((mode) => (
              <button
                aria-pressed={activeMode === mode.id}
                key={mode.id}
                onClick={() => onChangeMode?.(mode.id)}
                style={{
                  ...styles.modeButton,
                  ...(activeMode === mode.id ? styles.modeButtonSelected : {}),
                }}
                type="button"
              >
                {mode.label}
              </button>
            ))}
          </div>
          <button onClick={onNewThought} style={styles.primaryButton} type="button">
            Capture Thought
          </button>
        </div>
        {interactionMessage ? (
          <p aria-live="polite" style={styles.status}>
            {interactionMessage}
          </p>
        ) : null}
      </header>

      <div style={styles.main}>
        <section aria-labelledby="brain-stream-heading" style={styles.panel}>
          <p style={styles.eyebrow}>Main stream</p>
          <h2 id="brain-stream-heading" style={styles.thoughtTitle}>
            Recent claims and thoughts
          </h2>
          <BrainStateBanner state={screenState} message={statusMessage} onRetry={onRetry} technicalDetail={technicalDetail} />
          {model.stream.length > 0 ? (
            <ol style={styles.list}>
              {model.stream.map((thought) => (
                <li key={thought.id} style={styles.listItem}>
                  <button
                    aria-pressed={thought.isSelected}
                    onClick={() => onSelectThought?.(thought.id)}
                    style={styles.thoughtButton}
                    type="button"
                  >
                    <ThoughtCard preview thought={thought} />
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <FirstRunFallback onNewThought={onNewThought} />
          )}
        </section>

        <aside aria-label="Brain inspector" style={styles.sideRail}>
          <section aria-labelledby="sphere-session-heading" style={styles.panel}>
            <p style={styles.eyebrow}>Sphere</p>
            <h2 id="sphere-session-heading" style={styles.thoughtTitle}>
              Work sphere
            </h2>
            <SphereSessionAffordances model={model} />
          </section>

          <section aria-labelledby="selected-thought-heading" style={styles.panel}>
            <p style={styles.eyebrow}>Selected claim</p>
            <h2 id="selected-thought-heading" style={styles.thoughtTitle}>
              Claim panel
            </h2>
            {model.selectedPanel ? (
              <SelectedClaimPanel model={model.selectedPanel} />
            ) : (
              <p style={styles.emptyState}>Select a claim to inspect it.</p>
            )}
          </section>

          <section aria-labelledby="claim-inspector-heading" style={styles.panel}>
            <p style={styles.eyebrow}>Summary</p>
            <h2 id="claim-inspector-heading" style={styles.thoughtTitle}>
              Claim inspector
            </h2>
            <dl style={styles.facts}>
              <Fact label="Status" value={model.inspector.status} />
              <Fact label="Thought ID" value={model.inspector.selectedId ?? "None"} />
              <Fact label="Map ID" value={model.inspector.mapId ?? "None"} />
              <Fact label="Confidence" value={<ConfidenceChip scale="basis-points" value={model.inspector.confidenceBps} />} />
              <Fact label="Updated" value={model.inspector.updatedAtLabel} />
            </dl>
            <InspectorGroup title="Key connections" items={model.inspector.keyConnections} emptyLabel="No connected claims yet." />
            <InspectorGroup title="Dependencies" items={model.inspector.dependencies} emptyLabel="Nothing this depends on yet." />
            <InspectorGroup
              title="Tension"
              items={model.inspector.contradictionMarkers}
              emptyLabel="No tension found yet."
              warning
            />
            <InspectorGroup title="Recent activity" items={model.inspector.recentActivity} emptyLabel="No recent activity yet." />
          </section>

          <section aria-labelledby="recent-thoughts-heading" style={styles.panel}>
            <p style={styles.eyebrow}>Recent</p>
            <h2 id="recent-thoughts-heading" style={styles.thoughtTitle}>
              Recent thoughts
            </h2>
            {model.recentThoughts.length > 0 ? (
              <div style={styles.stack}>
                {model.recentThoughts.map((thought) => (
                  <ThoughtSummary key={thought.id} thought={thought} />
                ))}
              </div>
            ) : (
              <p style={styles.emptyState}>No recent thoughts yet.</p>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}

function BrainStateBanner({
  message,
  onRetry,
  state,
  technicalDetail,
}: {
  message?: string | null;
  onRetry?: () => void;
  state: NonNullable<BrainScreenProps["state"]>;
  technicalDetail?: string | null;
}) {
  const showTechnicalDetail = state === "error" && process.env.NODE_ENV !== "production" && Boolean(technicalDetail);
  const copy = {
    empty: {
      title: "Nothing here yet",
      body: message ?? "Capture one thought to start the map.",
      style: styles.stateBannerEmpty,
    },
    error: {
      title: "Brain did not load",
      body: message ?? "Retry, or return to the workspace and keep the same context.",
      style: styles.stateBannerError,
    },
    loading: {
      title: "Loading Brain",
      body: message ?? "Loading the current map.",
      style: styles.stateBannerLoading,
    },
    populated: {
      title: "Brain is ready",
      body: message ?? "Claims are loaded for this map.",
      style: styles.stateBannerPopulated,
    },
  }[state];

  return (
    <div aria-live={state === "loading" ? "polite" : undefined} role={state === "error" ? "alert" : "status"} style={{ ...styles.stateBanner, ...copy.style }}>
      <p style={styles.stateTitle}>{copy.title}</p>
      <p style={styles.stateBody}>{copy.body}</p>
      {showTechnicalDetail ? (
        <details style={styles.stateTechnicalDetail}>
          <summary style={styles.stateTechnicalSummary}>Technical detail</summary>
          <p style={styles.stateBody}>{technicalDetail}</p>
        </details>
      ) : null}
      {state === "error" && onRetry ? (
        <button onClick={onRetry} style={{ ...styles.primaryButton, marginTop: 12 }} type="button">
          Retry
        </button>
      ) : null}
    </div>
  );
}

function FirstRunFallback({ onNewThought }: { onNewThought?: () => void }) {
  return (
    <section aria-label="Guided first-run empty state" style={styles.firstRunState}>
      <div>
        <p style={styles.eyebrow}>First run</p>
        <h3 style={styles.thoughtTitle}>Start with one belief.</h3>
        <p style={styles.thoughtBody}>Penny needs one thought before it can show claims, confidence, or tension.</p>
      </div>
      <blockquote style={styles.firstRunPrompt}>{firstThoughtPrompt}</blockquote>
      <ul style={styles.firstRunSteps}>
        <li style={styles.firstRunStep}>1. Capture the raw thought.</li>
        <li style={styles.firstRunStep}>2. Find the claim inside it.</li>
        <li style={styles.firstRunStep}>3. Put the claim under pressure.</li>
      </ul>
      <section aria-label="Sample first-run prompts">
        <p style={styles.eyebrow}>Sample prompts</p>
        <ul style={styles.samplePromptList}>
          {samplePrompts.map((prompt) => (
            <li key={prompt} style={styles.samplePromptItem}>
              {prompt}
            </li>
          ))}
        </ul>
      </section>
      <button onClick={onNewThought} style={styles.primaryButton} type="button">
        Capture this thought
      </button>
    </section>
  );
}

function ContextValue({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.contextItem}>
      <span style={styles.contextLabel}>{label}</span>
      <span style={styles.contextValue}>{value}</span>
    </div>
  );
}

function ThoughtCard({ preview = false, thought }: { preview?: boolean; thought: BrainThoughtViewModel }) {
  return (
    <article style={{ ...styles.thoughtCard, ...(thought.isSelected ? styles.thoughtCardSelected : {}) }}>
      <div style={styles.thoughtRow}>
        <div style={styles.thoughtCopy}>
          <h3 style={styles.thoughtTitle}>{thought.title}</h3>
          <p style={styles.thoughtBody}>{preview ? thought.bodyPreview : thought.body}</p>
          <div style={styles.metadata}>
            <ConfidenceChip scale="basis-points" value={thought.confidenceBps} />
            <span>Updated {thought.updatedAtLabel}</span>
          </div>
        </div>
        <ConfidenceMiniGraph confidenceBps={thought.confidenceBps} label={thought.confidenceLabel} />
      </div>
    </article>
  );
}

function SphereSessionAffordances({ model }: { model: BrainViewModel }) {
  return (
    <div style={styles.stack}>
      <button
        aria-pressed={model.sphere.workSphere.isSelected}
        style={{
          ...styles.affordanceButton,
          ...(model.sphere.workSphere.isSelected ? styles.affordanceButtonSelected : {}),
        }}
        type="button"
      >
        <span style={styles.affordanceTitle}>{model.sphere.workSphere.label}</span>
        <span style={styles.affordanceDescription}>{model.sphere.workSphere.description}</span>
      </button>

      <section aria-label="Recent sessions">
        <p style={styles.eyebrow}>Recent sessions</p>
        {model.sphere.recentSessions.length > 0 ? (
          <ol style={styles.relatedList}>
            {model.sphere.recentSessions.map((session) => (
              <li key={session.id} style={styles.relatedItem}>
                <button
                  aria-pressed={session.isSelected}
                  style={{
                    ...styles.affordanceButton,
                    ...(session.isSelected ? styles.affordanceButtonSelected : {}),
                  }}
                  type="button"
                >
                  <span style={styles.affordanceTitle}>{session.title}</span>
                  <span style={styles.affordanceDescription}>{session.summary}</span>
                  <span style={styles.metadata}>Updated {session.updatedAtLabel}</span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p style={styles.emptyState}>No recent Brain sessions yet.</p>
        )}
      </section>
    </div>
  );
}

function SelectedClaimPanel({ model }: { model: NonNullable<BrainViewModel["selectedPanel"]> }) {
  return (
    <div style={styles.selectedPanel}>
      <article style={styles.selectedCard}>
        <h3 style={styles.thoughtTitle}>{model.title}</h3>
        <p style={styles.thoughtBody}>{model.body}</p>
        <div style={styles.metadata}>
          <ConfidenceChip scale="basis-points" value={model.confidenceBps} />
        </div>
      </article>

      <section aria-label="Dependencies and related claims">
        <p style={styles.eyebrow}>Find what this depends on</p>
        <p style={styles.thoughtBody}>{model.dependenciesLabel}</p>
        {model.relatedClaims.length > 0 ? (
          <ul style={styles.relatedList}>
            {model.relatedClaims.map((claim) => (
              <li key={claim.id} style={styles.relatedItem}>
                <a href={claim.brainMapHref} style={styles.relatedLink}>
                  <strong>{claim.title}</strong>
                  <span style={styles.metadata}>
                    <ConfidenceChip scale="basis-points" value={claim.confidenceBps} />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <div style={styles.selectedActions}>
        <a href={model.brainMapHref} style={styles.actionLink}>
          Show in Brain
        </a>
      </div>
    </div>
  );
}

function ThoughtSummary({ thought }: { thought: BrainThoughtViewModel }) {
  return (
    <article style={styles.thoughtCard}>
      <h3 style={styles.thoughtTitle}>{thought.title}</h3>
      <div style={styles.metadata}>
        <ConfidenceChip scale="basis-points" value={thought.confidenceBps} />
        <span>{thought.updatedAtLabel}</span>
      </div>
    </article>
  );
}

function ConfidenceMiniGraph({ confidenceBps, label }: { confidenceBps: number | null; label: string }) {
  const activeBars = typeof confidenceBps === "number" ? Math.max(1, Math.ceil(Math.max(0, Math.min(confidenceBps, 10000)) / 2000)) : 0;
  const heights = ["34%", "52%", "72%", "88%", "100%"];

  return (
    <div aria-label={`Confidence mini graph: ${label}`} role="img" style={styles.confidenceGraph}>
      {heights.map((height, index) => (
        <span
          key={height}
          style={{
            ...styles.confidenceBar,
            ...(index < activeBars ? styles.confidenceBarActive : {}),
            height,
          }}
        />
      ))}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={styles.factRow}>
      <dt style={styles.factLabel}>{label}</dt>
      <dd style={styles.factValue}>{value}</dd>
    </div>
  );
}

function InspectorGroup({
  emptyLabel,
  items,
  title,
  warning = false,
}: {
  emptyLabel: string;
  items: Array<{ id: string; title: string; detail: string }>;
  title: string;
  warning?: boolean;
}) {
  return (
    <section aria-label={title} style={styles.inspectorGroup}>
      <p style={styles.eyebrow}>{title}</p>
      {items.length > 0 ? (
        <ul style={styles.inspectorList}>
          {items.map((item) => (
            <li key={item.id} style={{ ...styles.inspectorItem, ...(warning ? styles.inspectorItemWarning : {}) }}>
              <strong style={styles.inspectorItemTitle}>{item.title}</strong>
              <span style={styles.inspectorItemDetail}>{item.detail}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p style={styles.emptyState}>{emptyLabel}</p>
      )}
    </section>
  );
}
