import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BrainScreen } from "../../../apps/web/components/brain/brain-screen.tsx";
import { createBrainViewModel } from "../../../apps/web/lib/viewmodels/brain/create-brain-view-model.ts";
import type { BrainProjectionView } from "../../../apps/web/lib/viewmodels/brain/types.ts";

function populatedProjection(): BrainProjectionView {
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
      {
        id: "claim-2",
        mapId: "map-1",
        body: "Related claims should stay visible beside the selected claim.",
        confidenceBps: 6600,
        createdAt: "2026-04-24T10:06:00.000Z",
        updatedAt: "2026-04-24T10:07:00.000Z",
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
  };
}

function emptyProjection(): BrainProjectionView {
  return {
    currentContext: {
      mode: "brain",
      mapId: null,
      claimId: null,
    },
    workspaceContext: {
      mode: "brain",
      mapId: null,
      claimId: null,
    },
    mapSummary: null,
    claims: [],
    selectedClaim: null,
    recentEvents: [],
  };
}

test("BrainScreen renders the populated Brain state", () => {
  const model = createBrainViewModel(populatedProjection());

  const html = renderToStaticMarkup(createElement(BrainScreen, { model, state: "populated" }));

  assert.match(html, /Thought stream/);
  assert.match(html, /Map and sphere context/);
  assert.match(html, /Recent claims and thoughts/);
  assert.match(html, /Claim panel/);
  assert.match(html, /Claim inspector/);
  assert.match(html, /Dependencies and related claims/);
  assert.match(html, /Related claims should stay visible beside the selected claim/);
  assert.match(html, /View on Brain Map/);
  assert.match(html, /Recent thoughts/);
  assert.match(html, /Investor diligence map/);
  assert.match(html, /Penny should make claim history inspectable/);
  assert.match(html, /Confidence mini graph: 74% confidence/);
  assert.match(html, /Populated Brain state/);
});

test("BrainScreen renders the empty Brain state", () => {
  const model = createBrainViewModel(emptyProjection());

  const html = renderToStaticMarkup(createElement(BrainScreen, { model, state: "empty" }));

  assert.match(html, /Empty Brain state/);
  assert.match(html, /No thoughts returned by the Brain projection/);
  assert.match(html, /No map selected/);
  assert.match(html, /Select a thought to inspect it/);
});

test("BrainScreen renders the loading Brain state", () => {
  const model = createBrainViewModel(emptyProjection());

  const html = renderToStaticMarkup(
    createElement(BrainScreen, {
      model,
      state: "loading",
      statusMessage: "Loading Brain projection.",
    }),
  );

  assert.match(html, /Brain loading state/);
  assert.match(html, /Loading Brain projection/);
});

test("BrainScreen renders the error Brain state", () => {
  const model = createBrainViewModel(emptyProjection());

  const html = renderToStaticMarkup(
    createElement(BrainScreen, {
      model,
      state: "error",
      statusMessage: "Projection request failed.",
    }),
  );

  assert.match(html, /Brain error state/);
  assert.match(html, /Projection request failed/);
});
