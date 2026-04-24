import React, { type CSSProperties } from "react";
import type { BrainThoughtViewModel, BrainViewModel } from "../../lib/viewmodels/brain";

type BrainScreenProps = {
  model: BrainViewModel;
  statusMessage?: string | null;
  onSelectThought?: (thoughtId: string) => void;
};

const styles = {
  shell: {
    minHeight: "100vh",
    background: "#f4f6f2",
    color: "#17201b",
  },
  header: {
    borderBottom: "1px solid #d8ded5",
    background: "#fbfcf7",
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
    color: "#2f6b55",
    fontSize: 12,
    fontWeight: 800,
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
  contextItem: {
    border: "1px solid #d8ded5",
    borderRadius: 8,
    background: "#ffffff",
    padding: 14,
  },
  contextLabel: {
    color: "#637069",
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
    background: "#fbfcf7",
    border: "1px solid #d8ded5",
    borderRadius: 8,
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
    background: "#ffffff",
    border: "1px solid #d8ded5",
    borderRadius: 8,
    padding: 16,
  },
  thoughtCardSelected: {
    borderColor: "#2f6b55",
    boxShadow: "inset 4px 0 0 #2f6b55",
  },
  thoughtTitle: {
    fontSize: 17,
    lineHeight: 1.35,
    margin: 0,
  },
  thoughtBody: {
    color: "#4d5b52",
    lineHeight: 1.55,
    margin: "8px 0 0",
  },
  metadata: {
    alignItems: "center",
    color: "#3c6177",
    display: "flex",
    flexWrap: "wrap",
    fontSize: 13,
    gap: 10,
    marginTop: 12,
  },
  sideRail: {
    display: "grid",
    gap: 18,
  },
  selectedCard: {
    background: "#ffffff",
    border: "1px solid #c9d2c8",
    borderRadius: 8,
    padding: 18,
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
    color: "#637069",
    fontSize: 12,
  },
  factValue: {
    margin: 0,
    overflowWrap: "anywhere",
  },
  emptyState: {
    border: "1px dashed #b8c3b8",
    borderRadius: 8,
    color: "#637069",
    margin: 0,
    padding: 18,
  },
  status: {
    color: "#637069",
    margin: "0 0 12px",
  },
} satisfies Record<string, CSSProperties>;

export function BrainScreen({ model, onSelectThought, statusMessage }: BrainScreenProps) {
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
      </header>

      <div style={styles.main}>
        <section aria-labelledby="brain-stream-heading" style={styles.panel}>
          <p style={styles.eyebrow}>Main stream</p>
          <h2 id="brain-stream-heading" style={styles.thoughtTitle}>
            Current thoughts
          </h2>
          {statusMessage ? <p style={styles.status}>{statusMessage}</p> : null}
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
                    <ThoughtCard thought={thought} />
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p style={styles.emptyState}>No thoughts returned by the Brain projection.</p>
          )}
        </section>

        <aside aria-label="Brain inspector" style={styles.sideRail}>
          <section aria-labelledby="selected-thought-heading" style={styles.panel}>
            <p style={styles.eyebrow}>Selected thought</p>
            <h2 id="selected-thought-heading" style={styles.thoughtTitle}>
              Focus card
            </h2>
            {model.selectedThought ? (
              <div style={styles.selectedCard}>
                <ThoughtCard thought={model.selectedThought} />
              </div>
            ) : (
              <p style={styles.emptyState}>Select a thought to inspect it.</p>
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
              <Fact label="Confidence" value={model.inspector.confidenceLabel} />
              <Fact label="Updated" value={model.inspector.updatedAtLabel} />
            </dl>
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

function ContextValue({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.contextItem}>
      <span style={styles.contextLabel}>{label}</span>
      <span style={styles.contextValue}>{value}</span>
    </div>
  );
}

function ThoughtCard({ thought }: { thought: BrainThoughtViewModel }) {
  return (
    <article style={{ ...styles.thoughtCard, ...(thought.isSelected ? styles.thoughtCardSelected : {}) }}>
      <h3 style={styles.thoughtTitle}>{thought.title}</h3>
      <p style={styles.thoughtBody}>{thought.body}</p>
      <div style={styles.metadata}>
        <span>{thought.confidenceLabel}</span>
        <span>Updated {thought.updatedAtLabel}</span>
      </div>
    </article>
  );
}

function ThoughtSummary({ thought }: { thought: BrainThoughtViewModel }) {
  return (
    <article style={styles.thoughtCard}>
      <h3 style={styles.thoughtTitle}>{thought.title}</h3>
      <div style={styles.metadata}>
        <span>{thought.confidenceLabel}</span>
        <span>{thought.updatedAtLabel}</span>
      </div>
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.factRow}>
      <dt style={styles.factLabel}>{label}</dt>
      <dd style={styles.factValue}>{value}</dd>
    </div>
  );
}
