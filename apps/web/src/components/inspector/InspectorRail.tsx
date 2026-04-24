import { memo, type ReactNode } from "react";

import { ConnectionList, type InspectorConnection } from "./ConnectionList";
import { ContradictionMarkers, type ContradictionMarker } from "./ContradictionMarkers";

type InspectorActivity = {
  id: string;
  title: string;
  detail?: string;
};

type InspectorRailProps = {
  ariaLabel?: string;
  activity?: InspectorActivity[];
  children?: ReactNode;
  className?: string;
  connections?: InspectorConnection[];
  contradictions?: ContradictionMarker[];
  dependencies?: InspectorConnection[];
  selectedTitle?: string;
};

const railStyle = {
  display: "grid",
  gap: 18,
  minWidth: 0,
} as const;

const panelStyle = {
  minWidth: 0,
  border: "1px solid rgba(23, 32, 27, 0.1)",
  borderRadius: 8,
  padding: 18,
  background: "rgba(251, 252, 247, 0.88)",
  boxShadow: "0 18px 44px rgba(23, 32, 27, 0.08)",
} as const;

const activityListStyle = {
  display: "grid",
  gap: 10,
  margin: 0,
  padding: 0,
} as const;

export const InspectorRail = memo(function InspectorRail({
  ariaLabel = "Inspector",
  activity = [],
  children,
  className,
  connections = [],
  contradictions = [],
  dependencies = [],
  selectedTitle = "No node selected",
}: InspectorRailProps) {
  const hasSelectedNode = selectedTitle.trim().toLowerCase() !== "no node selected";

  return (
    <aside aria-label={ariaLabel} className={className} style={railStyle}>
      <section style={panelStyle}>
        <p className="penny-kicker">Inspector</p>
        <h2 style={{ margin: 0, fontSize: "1.08rem", lineHeight: 1.28 }}>{selectedTitle}</h2>
        {hasSelectedNode ? (
          children
        ) : (
          <>
            <p style={{ color: "#637069", lineHeight: 1.55, margin: "10px 0 0" }}>
              Select a node to inspect confidence, dependencies, and recent activity.
            </p>
            {children}
          </>
        )}
      </section>

      <section style={panelStyle}>
        <ConnectionList items={connections} title="Key connections" />
      </section>

      <section style={panelStyle}>
        <ConnectionList emptyLabel="Nothing this depends on yet." items={dependencies} title="Dependencies" />
      </section>

      <section style={panelStyle}>
        <ContradictionMarkers markers={contradictions} />
      </section>

      <section style={panelStyle}>
        <p className="penny-kicker">Recent activity</p>
        {activity.length > 0 ? (
          <ul style={activityListStyle}>
            {activity.map((item, index) => (
              <li key={`${item.id}:${index}`} style={{ listStyle: "none" }}>
                <strong style={{ color: "#17201b", overflowWrap: "anywhere" }}>{item.title}</strong>
                {item.detail ? <span style={{ color: "#637069", display: "block", fontSize: 13, lineHeight: 1.45 }}>{item.detail}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p>No recent activity yet.</p>
        )}
      </section>
    </aside>
  );
});
