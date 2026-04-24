import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BrainScreen } from "../../../apps/web/components/brain/brain-screen.tsx";
import { createBrainViewModel } from "../../../apps/web/lib/viewmodels/brain/create-brain-view-model.ts";

test("BrainScreen renders the MVP Brain regions", () => {
  const model = createBrainViewModel({
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
      title: "Investor diligence map",
      claimCount: 1,
    },
    claims: [
      {
        id: "claim-1",
        mapId: "map-1",
        body: "Penny should make claim history inspectable.",
        confidenceBps: 7400,
        createdAt: "2026-04-24T10:00:00.000Z",
        updatedAt: "2026-04-24T10:05:00.000Z",
      },
    ],
    selectedClaim: {
      id: "claim-1",
      mapId: "map-1",
      body: "Penny should make claim history inspectable.",
      confidenceBps: 7400,
      createdAt: "2026-04-24T10:00:00.000Z",
      updatedAt: "2026-04-24T10:05:00.000Z",
    },
    recentEvents: [],
  });

  const html = renderToStaticMarkup(createElement(BrainScreen, { model }));

  assert.match(html, /Thought stream/);
  assert.match(html, /Map and sphere context/);
  assert.match(html, /Current thoughts/);
  assert.match(html, /Focus card/);
  assert.match(html, /Claim inspector/);
  assert.match(html, /Recent thoughts/);
  assert.match(html, /Investor diligence map/);
  assert.match(html, /Penny should make claim history inspectable/);
});
