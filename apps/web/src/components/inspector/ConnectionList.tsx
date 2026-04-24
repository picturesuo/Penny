import { memo } from "react";

export type InspectorConnection = {
  id: string;
  title: string;
  detail?: string;
  kind?: "connection" | "dependency";
  onSelect?: () => void;
};

type ConnectionListProps = {
  emptyLabel?: string;
  items: InspectorConnection[];
  title?: string;
};

const listStyle = {
  display: "grid",
  gap: 10,
  margin: 0,
  padding: 0,
} as const;

const itemStyle = {
  display: "grid",
  gap: 5,
  listStyle: "none",
  border: "1px solid rgba(23, 32, 27, 0.08)",
  borderRadius: 8,
  padding: 12,
  background: "#fffdf7",
} as const;

const buttonStyle = {
  ...itemStyle,
  width: "100%",
  color: "inherit",
  cursor: "pointer",
  font: "inherit",
  textAlign: "left",
} as const;

export const ConnectionList = memo(function ConnectionList({ emptyLabel = "No connections projected yet.", items, title = "Key connections" }: ConnectionListProps) {
  return (
    <section aria-label={title}>
      <p className="penny-kicker">{title}</p>
      {items.length > 0 ? (
        <ul style={listStyle}>
          {items.map((item, index) => {
            const content = (
              <>
                <strong style={{ color: "#17201b", overflowWrap: "anywhere" }}>{item.title}</strong>
                {item.detail ? <span style={{ color: "#637069", fontSize: 13, lineHeight: 1.45 }}>{item.detail}</span> : null}
              </>
            );

            return (
              <li key={`${item.id}:${index}`} style={{ listStyle: "none" }}>
                {item.onSelect ? (
                  <button type="button" style={buttonStyle} onClick={item.onSelect}>
                    {content}
                  </button>
                ) : (
                  <article style={itemStyle}>{content}</article>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p>{emptyLabel}</p>
      )}
    </section>
  );
});
