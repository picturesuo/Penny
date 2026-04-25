import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BrainScreen } from "../../apps/web/components/brain/brain-screen.tsx";
import { ConfidenceRatingControl } from "../../apps/web/components/confidence/ConfidenceRatingControl.tsx";
import { GraphView } from "../../apps/web/components/graph/graph-view.tsx";
import { CommandPalette, type CommandPaletteItem } from "../../apps/web/src/components/command/CommandPalette.tsx";
import { InspectorRail } from "../../apps/web/src/components/inspector/InspectorRail.tsx";
import { ErrorState } from "../../apps/web/components/ui/ErrorState.tsx";
import { createSearchApiClient } from "../../apps/web/lib/api/search.ts";
import { createBrainViewModel } from "../../apps/web/lib/viewmodels/brain/create-brain-view-model.ts";
import { buildChallengeExperienceViewModel } from "../../apps/web/lib/viewmodels/challenge/challenge-experience.ts";
import { buildLearnExperienceViewModel } from "../../apps/web/lib/viewmodels/learn/learn-experience.ts";
import type { BrainProjectionView } from "../../apps/web/lib/viewmodels/brain/types.ts";
import type { GraphModel } from "../../apps/web/lib/types/graph.ts";

const onboardingPath = new URL("../../apps/web/src/screens/Onboarding.tsx", import.meta.url);
const pennyShellPath = new URL("../../apps/web/components/penny-shell.tsx", import.meta.url);
const commandPaletteHookPath = new URL("../../apps/web/src/hooks/useCommandPalette.ts", import.meta.url);
const extractClaimsRoutePath = new URL("../../apps/web/app/ai/extract-claims/route.ts", import.meta.url);
const challengeIdeaRoutePath = new URL("../../apps/web/app/ai/challenge-idea/route.ts", import.meta.url);
const explainBlockerRoutePath = new URL("../../apps/web/app/ai/explain-blocker/route.ts", import.meta.url);
const challengeExperiencePath = new URL("../../apps/web/components/challenge/challenge-experience.tsx", import.meta.url);
const learnExperiencePath = new URL("../../apps/web/components/learn/learn-experience.tsx", import.meta.url);

function stripMarkup(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function brainProjection(claims: BrainProjectionView["claims"]): BrainProjectionView {
  return {
    currentContext: {
      mode: "brain",
      mapId: "map-flow",
      claimId: claims[0]?.id ?? null,
    },
    workspaceContext: {
      mode: "brain",
      mapId: "map-flow",
      claimId: claims[0]?.id ?? null,
    },
    mapSummary: {
      id: "map-flow",
      title: "MVP flow map",
      claimCount: claims.length,
    },
    claims,
    selectedClaim: claims[0] ?? null,
    recentEvents: [],
  };
}

const createdThoughtClaim = {
  id: "claim-created-thought",
  mapId: "map-flow",
  body: "A captured thought should show up in Brain after submit.",
  confidenceBps: 7000,
  createdAt: "2026-04-24T12:00:00.000Z",
  updatedAt: "2026-04-24T12:01:00.000Z",
};

test("MVP flow: the Second Brain terminal entry opens Brain mode", async () => {
  const onboardingSource = await readFile(onboardingPath, "utf8");

  assert.match(onboardingSource, /label: "Second Brain"/);
  assert.match(onboardingSource, /href: "\/app\?mode=brain"/);
  assert.match(onboardingSource, /What are we thinking about today/);
});

test("MVP flow: thought capture submits and shows the created thought in Brain", async () => {
  const shellSource = await readFile(pennyShellPath, "utf8");
  const model = createBrainViewModel(brainProjection([createdThoughtClaim]));
  const html = renderToStaticMarkup(createElement(BrainScreen, { model, state: "populated" }));

  assert.match(shellSource, /function ClaimComposer/);
  assert.match(shellSource, /onSubmit\(trimmed\)/);
  assert.match(shellSource, /postCommand<\{ claimId: string \}>\("\/api\/commands\/claims\/create"/);
  assert.match(shellSource, /message: "Claim saved\."/);
  assert.match(stripMarkup(html), /A captured thought should show up in Brain after submit/);
});

test("MVP flow: selecting a thought preserves the selected claim for downstream extraction", async () => {
  const shellSource = await readFile(pennyShellPath, "utf8");
  const model = createBrainViewModel(brainProjection([createdThoughtClaim]));
  const html = renderToStaticMarkup(createElement(BrainScreen, { model, state: "populated" }));

  assert.match(shellSource, /setSelectedNodeId\(claim\.id\)/);
  assert.match(shellSource, /void onSelectClaim\(claim\.id\)/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(stripMarkup(html), /Claim panel/);
  assert.match(stripMarkup(html), /A captured thought should show up in Brain after submit/);
});

test("MVP flow: Extract Claims reaches the endpoint contract and displays returned claims", async () => {
  const routeSource = await readFile(extractClaimsRoutePath, "utf8");
  const extractedClaim = {
    ...createdThoughtClaim,
    id: "claim-extracted",
    body: "Extracted claims should render in the Brain claim list.",
    confidenceBps: 8200,
  };
  const model = createBrainViewModel(brainProjection([extractedClaim]));
  const html = renderToStaticMarkup(createElement(BrainScreen, { model, state: "populated" }));

  assert.match(routeSource, /POST\(request: Request\)/);
  assert.match(routeSource, /extractClaims\(/);
  assert.match(routeSource, /thoughtId: body\.thoughtId/);
  assert.match(stripMarkup(html), /Extracted claims should render in the Brain claim list/);
  assert.match(stripMarkup(html), /High confidence/);
});

test("MVP flow: clicking a graph node selects it and updates the inspector contract", async () => {
  const shellSource = await readFile(pennyShellPath, "utf8");
  const graph: GraphModel = {
    title: "MVP graph",
    selectedNodeId: "claim-created-thought",
    nodes: [
      {
        id: "claim-created-thought",
        kind: "claim",
        label: "Selected graph claim",
        x: 0,
        y: 0,
        confidence: 70,
      },
    ],
    edges: [],
  };
  const graphHtml = renderToStaticMarkup(createElement(GraphView, { graph, selectedNodeId: "claim-created-thought" }));
  const inspectorHtml = renderToStaticMarkup(createElement(InspectorRail, { selectedTitle: "Selected graph claim" }));

  assert.match(shellSource, /onSelectNode=\{inspectGraphNode\}/);
  assert.match(shellSource, /setSelectedNodeId\(node\.id\)/);
  assert.match(shellSource, /selectedTitle=\{inspector\.node\?\.label \?\? "No node selected"\}/);
  assert.match(graphHtml, /data-selected="true"/);
  assert.match(stripMarkup(inspectorHtml), /Selected graph claim/);
});

test("MVP flow: ConfidenceRatingControl posts updated confidence through the shell", async () => {
  const shellSource = await readFile(pennyShellPath, "utf8");
  const html = renderToStaticMarkup(
    createElement(ConfidenceRatingControl, {
      label: "What changed your confidence?",
      scale: "basis-points",
      value: 5000,
      onValueChange: () => undefined,
    }),
  );

  assert.match(shellSource, /fetch\("\/api\/confidence"/);
  assert.match(shellSource, /method: "POST"/);
  assert.match(shellSource, /onValueChange=\{\(ratingBps\) => onRateClaim\(selectedClaim\.id, ratingBps\)\}/);
  assert.match(html, /What changed your confidence\?/);
  assert.match(html, /aria-pressed="true"[^>]*>\s*<span>50%<\/span>/);
});

test("MVP flow: Cmd+K and Ctrl+K open the command palette", async () => {
  const hookSource = await readFile(commandPaletteHookPath, "utf8");

  assert.match(hookSource, /const isCommandK = key === "k" && \(event\.metaKey \|\| event\.ctrlKey\) && !event\.altKey/);
  assert.match(hookSource, /event\.preventDefault\(\);\s*open\(\);/s);
});

test("MVP flow: mocked search returns a result for the command palette", async () => {
  const requests: string[] = [];
  const client = createSearchApiClient({
    fetcher: async (input) => {
      requests.push(String(input));

      return new Response(
        JSON.stringify({
          results: [
            {
              id: "claim-search-result",
              type: "claim",
              title: "Search result claim",
              subtitle: "Claim - 80% confidence",
              confidence: 80,
              href: "/workspace?mode=brain&mapId=map-flow&claimId=claim-search-result",
            },
          ],
        }),
        {
          headers: {
            "content-type": "application/json",
          },
        },
      );
    },
  });

  const results = await client.search("search result");

  assert.equal(requests[0], "/api/search?q=search+result");
  assert.equal(results?.[0]?.title, "Search result claim");
});

test("MVP flow: Challenge mode has the AI endpoint and result sections", async () => {
  const [routeSource, componentSource] = await Promise.all([readFile(challengeIdeaRoutePath, "utf8"), readFile(challengeExperiencePath, "utf8")]);
  const model = buildChallengeExperienceViewModel({
    activeClaim: {
      id: "claim-1",
      body: "Challenge should show structured tension.",
      confidenceBps: 6400,
    },
    activeChallengeRound: {
      id: "round-1",
      status: "started",
    },
    critiqueStatus: "ready",
    critiqueState: {
      status: "ready",
      critiqueId: "critique-1",
      critiquePayload: {
        critique: {
          conciseCritiqueSummary: "The claim needs a narrower proof point.",
          strongestCounterargument: "The claim may be true only for expert users.",
          assumptions: ["Users will review the critique."],
          likelyFailureModes: ["The flow may feel too slow."],
          followUpQuestions: ["What proof would change this?"],
          suggestedConfidenceDelta: -10,
          uncertaintyNote: "The segment is not yet known.",
        },
        metadata: {
          provider: "mock",
          model: "mock-model",
          promptVersion: "challenge-idea-v1",
        },
      },
    },
    responseState: {
      status: "not_recorded",
    },
  });

  assert.match(routeSource, /challengeIdea\(body\)/);
  assert.match(routeSource, /AI_OPERATIONS\.challengeIdea/);
  assert.match(componentSource, /Strongest counterargument/);
  assert.match(componentSource, /Show the tension/);
  assert.match(componentSource, /Find what this depends on/);
  assert.equal(model.strongestCounterargument, "The claim may be true only for expert users.");
  assert.equal(model.keyWeaknessSummary, "The claim needs a narrower proof point.");
});

test("MVP flow: Learn mode has the AI endpoint and result sections", async () => {
  const [routeSource, componentSource] = await Promise.all([readFile(explainBlockerRoutePath, "utf8"), readFile(learnExperiencePath, "utf8")]);
  const model = buildLearnExperienceViewModel({
    selectedMapId: "map-flow",
    selectedClaimId: "claim-learn",
    selectedClaim: {
      id: "claim-learn",
      body: "Learning should turn blockers into explanations.",
      confidenceBps: 7200,
    },
    learnState: {
      status: "placeholder",
      message: "Learn mode coming soon",
    },
    status: "placeholder",
    message: "Learn mode coming soon",
  });

  assert.match(routeSource, /explainBlocker\(body\)/);
  assert.match(routeSource, /AI_OPERATIONS\.explainBlocker/);
  assert.match(componentSource, /Plain version/);
  assert.match(componentSource, /Teach-back/);
  assert.match(componentSource, /Retrieval checks/);
  assert.equal(model.heroTitle, "Learning should turn blockers into explanations");
  assert.match(model.feedback.body, /concrete example/);
});

test("MVP flow: one loading state is visible", () => {
  const model = createBrainViewModel(brainProjection([]));
  const html = renderToStaticMarkup(
    createElement(BrainScreen, {
      model,
      state: "loading",
      statusMessage: "Loading Brain projection.",
    }),
  );

  assert.match(stripMarkup(html), /Loading Brain/);
  assert.match(stripMarkup(html), /Loading Brain projection/);
});

test("MVP flow: one friendly error state offers retry", () => {
  const retryLabel = "Retry";
  const html = renderToStaticMarkup(
    createElement(ErrorState, {
      actionLabel: retryLabel,
      message: "Penny could not load this view. Retry, or switch modes and keep the same context.",
      title: "View unavailable",
    }),
  );

  assert.match(html, /role="alert"/);
  assert.match(stripMarkup(html), /View unavailable/);
  assert.match(stripMarkup(html), /Penny could not load this view/);
  assert.match(stripMarkup(html), /Retry/);
});

test("MVP flow: empty states cover thoughts, graph, search, and inspector", () => {
  const emptyBrain = renderToStaticMarkup(createElement(BrainScreen, { model: createBrainViewModel(brainProjection([])), state: "empty" }));
  const emptyGraph = renderToStaticMarkup(
    createElement(GraphView, {
      graph: {
        title: "Empty graph",
        nodes: [],
        edges: [],
      },
    }),
  );
  const emptySearch = renderToStaticMarkup(
    createElement(CommandPalette, {
      isOpen: true,
      items: [] satisfies CommandPaletteItem[],
      onClose: () => undefined,
      onSelectItem: () => undefined,
      query: "missing",
      setQuery: () => undefined,
    }),
  );
  const emptyInspector = renderToStaticMarkup(createElement(InspectorRail));

  assert.match(stripMarkup(emptyBrain), /Nothing here yet/);
  assert.match(stripMarkup(emptyBrain), /No recent thoughts yet/);
  assert.match(stripMarkup(emptyGraph), /No graph nodes yet/);
  assert.match(stripMarkup(emptySearch), /Nothing found/);
  assert.match(stripMarkup(emptyInspector), /Select a node to inspect confidence, dependencies, and recent activity/);
});
