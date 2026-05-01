import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CanvasWorkspace } from "../src/components/CanvasWorkspace.tsx";
import type { SessionCanvasData } from "../src/types/brain";

test("CanvasWorkspace renders nodes, connectors, selection, and action menu", () => {
  const canvas: SessionCanvasData = {
    selectedNodeId: "claim-a",
    recommendedPath: ["claim-a", "claim-b"],
    nodes: [
      {
        id: "claim-a",
        kind: "claim",
        title: "Core claim",
        summary: "This is the selected canvas claim.",
        status: "exploratory",
        confidence: 72,
        x: 100,
        y: 80,
      },
      {
        id: "claim-b",
        kind: "assumption",
        title: "Hidden assumption",
        summary: "This is connected to the core claim.",
        status: "open",
        confidence: 48,
        x: 390,
        y: 130,
      },
    ],
    edges: [
      {
        id: "edge-a-b",
        source: "claim-a",
        target: "claim-b",
        kind: "depends_on",
        label: "depends on",
      },
    ],
  };
  const markup = renderToStaticMarkup(
    createElement(CanvasWorkspace, {
      sessionId: uuidAt(101),
      data: null,
      focusedClaimId: null,
      initialCanvasData: canvas,
      onNodeAction() {},
    }),
  );

  assert.match(markup, /Thinking graph/);
  assert.match(markup, /Core claim/);
  assert.match(markup, /Hidden assumption/);
  assert.match(markup, /depends on/);
  assert.match(markup, /Canvas node actions/);
  assert.match(markup, /Learn/);
  assert.match(markup, /Check/);
  assert.match(markup, /Verify/);
  assert.match(markup, /Save/);
  assert.match(markup, /Related/);
});

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
