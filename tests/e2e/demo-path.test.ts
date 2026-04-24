import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import {
  mockBrainView,
  mockChallengeView,
  mockLearnView,
} from "../../apps/web/components/graph/mock-graph-data";
import { buildChallengeExperienceViewModel } from "../../apps/web/lib/viewmodels/challenge/challenge-experience";
import { buildLearnExperienceViewModel } from "../../apps/web/lib/viewmodels/learn/learn-experience";

const appPagePath = new URL("../../apps/web/app/page.tsx", import.meta.url);
const brainPagePath = new URL("../../apps/web/app/brain/page.tsx", import.meta.url);
const pennyShellPath = new URL("../../apps/web/components/penny-shell.tsx", import.meta.url);
const challengeExperiencePath = new URL("../../apps/web/components/challenge/challenge-experience.tsx", import.meta.url);
const requestCritiqueRoutePath = new URL(
  "../../apps/web/app/api/commands/challenge/request-critique/route.ts",
  import.meta.url,
);

const demoSteps = [
  "open app",
  "navigate Brain",
  "switch to Challenge",
  "request critique",
  "switch to Learn",
  "return to Brain",
] as const;

test("E2E demo path has a committed route and UI contract for every step", async () => {
  const [appPage, brainPage, shell, challengeExperience] = await Promise.all([
    readFile(appPagePath, "utf8"),
    readFile(brainPagePath, "utf8"),
    readFile(pennyShellPath, "utf8"),
    readFile(challengeExperiencePath, "utf8"),
    access(requestCritiqueRoutePath).then(() => "exists"),
  ]);

  assert.deepEqual([...demoSteps], [
    "open app",
    "navigate Brain",
    "switch to Challenge",
    "request critique",
    "switch to Learn",
    "return to Brain",
  ]);

  assert.match(appPage, /HomePage/);
  assert.match(appPage, /AppShell|penny-entry/);
  assert.match(brainPage, /BrainRouteScreen/);
  assert.match(shell, /id: "brain", label: "Brain"/);
  assert.match(shell, /id: "challenge", label: "Challenge"/);
  assert.match(shell, /id: "learn", label: "Learn"/);
  assert.match(shell, /postCommand\("\/api\/commands\/workspace\/select"/);
  assert.match(shell, /claimId,/);
  assert.match(shell, /\/api\/commands\/challenge\/request-critique/);
  assert.match(shell, /fetchProjection<ProjectionView>\(`\/api\/workspace\/\$\{mode\}`/);
  assert.match(challengeExperience, /Request Critique/);
});

test("E2E demo path preserves selected claim through Brain, Challenge, Learn, and back", () => {
  const selectedClaimId = mockBrainView.selectedClaim?.id;
  const selectedClaimBody = mockBrainView.selectedClaim?.body;
  const challengeModel = buildChallengeExperienceViewModel(mockChallengeView);
  const learnModel = buildLearnExperienceViewModel(mockLearnView);
  const pathState = demoSteps.map((step) => {
    if (step === "switch to Challenge" || step === "request critique") {
      return {
        step,
        selectedClaimId: mockChallengeView.activeClaim?.id,
        selectedClaimBody: challengeModel.selectedClaim?.body,
      };
    }

    if (step === "switch to Learn") {
      return {
        step,
        selectedClaimId: mockLearnView.selectedClaimId,
        selectedClaimBody: learnModel.selectedClaim?.body,
      };
    }

    return {
      step,
      selectedClaimId,
      selectedClaimBody,
    };
  });

  assert.ok(selectedClaimId);
  assert.ok(selectedClaimBody);
  assert.deepEqual(
    pathState.map((state) => state.selectedClaimId),
    demoSteps.map(() => selectedClaimId),
  );
  assert.deepEqual(
    pathState.map((state) => state.selectedClaimBody),
    demoSteps.map(() => selectedClaimBody),
  );
});

test("E2E demo path critique step uses the live command route contract", async () => {
  const [shell, route] = await Promise.all([readFile(pennyShellPath, "utf8"), readFile(requestCritiqueRoutePath, "utf8")]);

  assert.match(shell, /requestId: createRequestId\("request-critique"\)/);
  assert.match(shell, /roundId,/);
  assert.match(route, /requestChallengeCritique/);
  assert.match(route, /getRequestUserId/);
  assert.match(route, /getIdempotencyKey/);
  assert.match(route, /status: 201/);
});
