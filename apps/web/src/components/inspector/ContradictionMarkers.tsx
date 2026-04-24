import { memo } from "react";

export type ContradictionMarker = {
  id: string;
  title: string;
  detail?: string;
  severity?: "low" | "medium" | "high";
  onSelect?: () => void;
};

type ContradictionMarkersProps = {
  emptyLabel?: string;
  markers: ContradictionMarker[];
  title?: string;
};

const severityLabels: Record<NonNullable<ContradictionMarker["severity"]>, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const listStyle = {
  display: "grid",
  gap: 10,
  margin: 0,
  padding: 0,
} as const;

const markerStyle = {
  display: "grid",
  gap: 6,
  border: "1px solid rgba(162, 59, 50, 0.28)",
  borderRadius: 8,
  padding: 12,
  background: "#fffdf7",
  boxShadow: "inset 3px 0 0 #a23b32",
} as const;

export const ContradictionMarkers = memo(function ContradictionMarkers({
  emptyLabel = "No tension found yet.",
  markers,
  title = "Show the tension",
}: ContradictionMarkersProps) {
  return (
    <section aria-label={title}>
      <p className="penny-kicker">{title}</p>
      {markers.length > 0 ? (
        <ul style={listStyle}>
          {markers.map((marker) => (
            <li key={marker.id} style={{ listStyle: "none" }}>
              <button
                type="button"
                disabled={!marker.onSelect}
                style={{
                  ...markerStyle,
                  width: "100%",
                  color: "inherit",
                  cursor: marker.onSelect ? "pointer" : "default",
                  font: "inherit",
                  opacity: marker.onSelect ? 1 : 0.96,
                  textAlign: "left",
                }}
                onClick={marker.onSelect}
              >
                <strong style={{ color: "#17201b", overflowWrap: "anywhere" }}>{marker.title}</strong>
                {marker.severity ? <span style={{ color: "#a23b32", fontSize: 12, fontWeight: 800 }}>{severityLabels[marker.severity]} risk</span> : null}
                {marker.detail ? <span style={{ color: "#637069", fontSize: 13, lineHeight: 1.45 }}>{marker.detail}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>{emptyLabel}</p>
      )}
    </section>
  );
});
