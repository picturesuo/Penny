import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BrainScreen } from "../../apps/web/components/brain/brain-screen.tsx";
import { ConfidenceChip } from "../../apps/web/components/confidence/ConfidenceChip.tsx";
import { GraphView } from "../../apps/web/components/graph/graph-view.tsx";
import { mockGraph } from "../../apps/web/components/graph/mock-graph-data.ts";
import { InspectorRail } from "../../apps/web/src/components/inspector/InspectorRail.tsx";
import { AppShell } from "../../apps/web/components/layout/AppShell.tsx";
import { createBrainViewModel } from "../../apps/web/lib/viewmodels/brain/create-brain-view-model.ts";
import type { BrainProjectionView } from "../../apps/web/lib/viewmodels/brain/types.ts";

const requireWithExtensions = createRequire(import.meta.url);

function textContent(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function brainProjection(): BrainProjectionView {
  return {
    currentContext: {
      mode: "brain",
      mapId: "map-1",
      claimId: "claim-1",
    },
    workspaceContext: {
      mode: "brain",
      mapId: "map-1",
      claimId: "claim-1",
    },
    mapSummary: {
      id: "map-1",
      title: "Investor memo",
      claimCount: 1,
    },
    claims: [
      {
        id: "claim-1",
        mapId: "map-1",
        body: "Distribution is the durable moat.",
        confidenceBps: 7400,
        createdAt: "2026-04-24T12:00:00.000Z",
        updatedAt: "2026-04-24T12:00:00.000Z",
      },
    ],
    selectedClaim: {
      id: "claim-1",
      mapId: "map-1",
      body: "Distribution is the durable moat.",
      confidenceBps: 7400,
      createdAt: "2026-04-24T12:00:00.000Z",
      updatedAt: "2026-04-24T12:00:00.000Z",
    },
    recentEvents: [],
  };
}

test("onboarding renders the MVP entry modes", async () => {
  requireWithExtensions.extensions[".css"] = (module) => {
    const styles = new Proxy({}, { get: (_target, key) => String(key) });
    module.exports = styles;
    module.exports.default = styles;
  };
  const { Onboarding } = await import("../../apps/web/src/screens/Onboarding.tsx");
  const html = renderToStaticMarkup(createElement(Onboarding));
  const text = textContent(html);

  assert.match(text, /What do you want to do today\?/);
  assert.match(text, /Brain/);
  assert.match(text, /Challenge/);
  assert.match(text, /Learn/);
});

test("app shell renders the mode switcher, workspace, and inspector rail", () => {
  const html = renderToStaticMarkup(createElement(AppShell));

  assert.match(html, /class="app-sidebar"/);
  assert.match(html, /aria-label="Modes"/);
  assert.match(html, /class="workspace-layout__main"/);
  assert.match(html, /class="inspector-rail"/);
  assert.match(html, /aria-label="Inspector"/);
});

test("Brain mode renders thought capture", () => {
  const model = createBrainViewModel(brainProjection());
  const html = renderToStaticMarkup(createElement(BrainScreen, { model, state: "populated" }));
  const text = textContent(html);

  assert.match(text, /Capture Thought/);
});

test("ConfidenceChip renders unrated, low, medium, and high labels", () => {
  const html = renderToStaticMarkup(
    createElement("div", null, [
      createElement(ConfidenceChip, { key: "unrated", value: null }),
      createElement(ConfidenceChip, { key: "low", value: 25 }),
      createElement(ConfidenceChip, { key: "medium", value: 55 }),
      createElement(ConfidenceChip, { key: "high", value: 85 }),
    ]),
  );
  const text = textContent(html);

  assert.match(text, /Unrated/);
  assert.match(text, /Low/);
  assert.match(text, /Medium/);
  assert.match(text, /High/);
});

test("graph view renders nodes and edges from mocked graph data", () => {
  const html = renderToStaticMarkup(createElement(GraphView, { graph: mockGraph }));
  const text = textContent(html);

  assert.match(html, /data-testid="penny-graph"/);
  assert.match(html, /data-testid="penny-graph-node"/);
  assert.match(html, /class="penny-graph-edge"/);
  assert.match(text, /Distribution is the durable moat/);
  assert.match(text, /contains/);
});

test("inspector empty state renders without a selected node", () => {
  const html = renderToStaticMarkup(createElement(InspectorRail));
  const text = textContent(html);

  assert.match(text, /Inspector/);
  assert.match(text, /No node selected/);
  assert.match(text, /Select a node to inspect confidence, dependencies, and recent activity/);
});
