import React from "react";
import { BookOpen, CheckCircle2, Network, Save, ShieldCheck } from "lucide-react";
import type { CanvasNode, CanvasNodeAction } from "../types/brain";
import type { PositionedCanvasNode } from "./CanvasEdgeLayer";

interface CanvasNodeCardProps {
  node: PositionedCanvasNode;
  selected: boolean;
  recommended: boolean;
  onSelect: (nodeId: string) => void;
  onAction: (action: CanvasNodeAction, node: CanvasNode) => void;
}

const nodeActions: Array<{
  action: CanvasNodeAction;
  label: string;
  title: string;
  Icon: typeof BookOpen;
}> = [
  { action: "learn", label: "Learn", title: "Learn from this node", Icon: BookOpen },
  { action: "check", label: "Check", title: "Check this node", Icon: CheckCircle2 },
  { action: "verify", label: "Verify", title: "Verify this node", Icon: ShieldCheck },
  { action: "save", label: "Save", title: "Save this node", Icon: Save },
  { action: "related", label: "Related", title: "Show related nodes", Icon: Network },
];

export function CanvasNodeCard({ node, selected, recommended, onSelect, onAction }: CanvasNodeCardProps) {
  const availableActions = node.actions?.length
    ? nodeActions.filter((item) => node.actions?.includes(item.action))
    : nodeActions;

  return (
    <article
      className={`canvas-node-card is-${node.kind}${selected ? " is-selected" : ""}${recommended ? " is-recommended" : ""}`}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        minHeight: node.height,
      }}
      aria-label={`${node.kind} node ${node.title}`}
    >
      <button type="button" className="canvas-node-hitbox" onClick={() => onSelect(node.id)}>
        <span className="canvas-node-kind">{node.kind}</span>
        <strong>{node.title}</strong>
        {node.summary ? <p>{node.summary}</p> : null}
        <span className="canvas-node-meta">
          {node.status ? <span>{node.status}</span> : null}
          {typeof node.confidence === "number" ? <span>{node.confidence}%</span> : null}
          {recommended ? <span>Path</span> : null}
        </span>
      </button>
      {selected ? (
        <div className="canvas-node-menu" aria-label="Canvas node actions">
          {availableActions.map(({ action, label, title, Icon }) => (
            <button
              key={action}
              type="button"
              className="canvas-node-action"
              title={title}
              onClick={() => onAction(action, node)}
            >
              <Icon aria-hidden="true" size={15} strokeWidth={2} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}
