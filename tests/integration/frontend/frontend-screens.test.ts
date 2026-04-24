import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BrainScreen } from "../../../apps/web/components/brain/brain-screen.tsx";
import { GraphView } from "../../../apps/web/components/graph/graph-view.tsx";
import { AppShell } from "../../../apps/web/components/layout/AppShell.tsx";
import { createBrainViewModel } from "../../../apps/web/lib/viewmodels/brain/create-brain-view-model.ts";
import { buildChallengeExperienceViewModel } from "../../../apps/web/lib/viewmodels/challenge/challenge-experience.ts";
import { buildLearnExperienceViewModel } from "../../../apps/web/lib/viewmodels/learn/learn-experience.ts";
import {
  mockBrainGraph,
  mockBrainView,
  mockChallengeView,
  mockGraph,
  mockLearnView,
} from "../../../apps/web/components/graph/mock-graph-data";

const challengeExperiencePath = new URL("../../../apps/web/components/challenge/challenge-experience.tsx", import.meta.url);
const learnExperiencePath = new URL("../../../apps/web/components/learn/learn-experience.tsx", import.meta.url);

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function stripMarkup(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

test("frontend shell loads the default workspace frame", () => {
  const html = renderToStaticMarkup(createElement(AppShell));

  assert.match(html, /app-shell/);
  assert.match(html, /Brain workspace/);
  assert.match(html, /One workspace, three lenses/);
  assert.match(html, /Brain/);
  assert.match(html, /Challenge/);
  assert.match(html, /Learn/);
});

test("Brain loads a populated projection into the UI", () => {
  const model = createBrainViewModel(mockBrainView);
  const html = renderToStaticMarkup(createElement(BrainScreen, { model, state: "populated" }));

  assert.match(html, /Thought stream/);
  assert.match(html, /Investor memo/);
  assert.match(html, /Distribution is the durable moat/);
  assert.match(html, /74% confidence/);
  assert.match(html, /Show in Brain/);
});

test("Challenge loads the selected claim into its view model and screen contract", async () => {
  const model = buildChallengeExperienceViewModel(mockChallengeView);
  const source = await readFile(challengeExperiencePath, "utf8");

  assert.equal(model.selectedClaim?.body, "Distribution is the durable moat.");
  assert.equal(model.challengeState.id, "critique_loaded");
  assert.equal(model.critiqueTransparency.status, "ready");
  assert.equal(model.critiqueTransparency.responseStatus, "responded");
  assert.match(source, /Challenge state/);
  assert.match(source, /Selected claim/);
  assert.match(source, /Response actions/);
});

test("Learn loads the selected claim into its view model and screen contract", async () => {
  const model = buildLearnExperienceViewModel(mockLearnView);
  const source = await readFile(learnExperiencePath, "utf8");

  assert.equal(model.heroTitle, "Distribution is the durable moat");
  assert.equal(model.experienceState.id, "active_concept");
  assert.equal(model.selectedClaim?.body, "Distribution is the durable moat.");
  assert.equal(model.reviewState.claimLabel, "mock-claim-distribution");
  assert.match(source, /Teach-back/);
  assert.match(source, /Claim to explain/);
  assert.match(source, /Where this lives/);
});

test("graph renders from mock data with selected node and mini-map", () => {
  const html = renderToStaticMarkup(createElement(GraphView, { graph: mockGraph }));

  assert.match(html, /data-testid="penny-graph"/);
  assert.match(html, /data-testid="penny-graph-node"/);
  assert.match(html, /data-selected="true"/);
  assert.match(html, /data-testid="penny-graph-minimap"/);
  assert.match(stripMarkup(html), /Distribution is the durable moat/);
});

test("mode switching preserves the selected claim in mode UI contracts", () => {
  const selectedClaim = "Distribution is the durable moat";
  const brainHtml = renderToStaticMarkup(
    createElement(BrainScreen, {
      model: createBrainViewModel(mockBrainView),
      state: "populated",
    }),
  );
  const challengeModel = buildChallengeExperienceViewModel(mockChallengeView);
  const learnModel = buildLearnExperienceViewModel(mockLearnView);

  assert.match(stripMarkup(brainHtml), new RegExp(selectedClaim));
  assert.match(challengeModel.selectedClaim?.body ?? "", new RegExp(selectedClaim));
  assert.match(learnModel.heroTitle, new RegExp(selectedClaim));
  assert.equal(mockBrainGraph.selectedNodeId, "mock-claim-distribution");
});

test("loading, empty, and error states render through the Brain UI state banner", () => {
  const emptyModel = createBrainViewModel({
    currentContext: { mode: "brain", mapId: null, claimId: null },
    workspaceContext: { mode: "brain", mapId: null, claimId: null },
    mapSummary: null,
    claims: [],
    selectedClaim: null,
    recentEvents: [],
  });
  const emptyHtml = renderToStaticMarkup(createElement(BrainScreen, { model: emptyModel, state: "empty" }));
  const loadingHtml = renderToStaticMarkup(
    createElement(BrainScreen, {
      model: emptyModel,
      state: "loading",
      statusMessage: "Loading Brain projection.",
    }),
  );
  const errorHtml = renderToStaticMarkup(
    createElement(BrainScreen, {
      model: emptyModel,
      state: "error",
      statusMessage: "Projection request failed.",
    }),
  );

  assert.match(emptyHtml, /Nothing here yet/);
  assert.match(emptyHtml, /Capture one thought to start the map/);
  assert.match(emptyHtml, /Guided first-run empty state/);
  assert.match(loadingHtml, /Loading Brain/);
  assert.match(loadingHtml, /Loading Brain projection/);
  assert.match(errorHtml, /Brain did not load/);
  assert.match(errorHtml, /Projection request failed/);
});
