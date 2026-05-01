import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildAutopilotStartIntent,
  modeForAutopilotCandidate,
  runAutopilotGoThere,
} from "../src/autopilotUx";
import { CurrentExploration } from "../src/components/CurrentExploration";
import type { AutopilotSuggestion, AutopilotTickData, BrainClaim } from "../src/types/brain";

test("CurrentExploration exposes the Autopilot Go There affordance", () => {
  const targetClaim = claim(uuidAt(202), "Founders need a durable thinking artifact before they commit time.");
  const markup = renderToStaticMarkup(
    createElement(CurrentExploration, {
      title: "Penny should guide founders through decisions.",
      subtitle: "Penny found a fragile adoption assumption.",
      claims: [targetClaim],
      paths: [],
      autopilotSuggestion: candidate({
        action: "challenge",
        mode: "challenge",
        primaryActionLabel: "Start Check",
        targetClaimId: targetClaim.id,
      }),
      focusedClaim: targetClaim,
      activeWorkStructureStep: null,
      onGoThere() {},
    }),
  );

  assert.match(markup, /Autopilot/);
  assert.match(markup, /Start Check/);
  assert.match(markup, /Go There/);
  assert.match(markup, /Target: Founders need a durable thinking artifact/);
});

test("Go There starts the selected candidate and refreshes cockpit once", async () => {
  const sessionId = uuidAt(101);
  const selected = candidate({
    action: "challenge",
    mode: "challenge",
    candidateId: "check-founder-risk",
    targetClaimId: uuidAt(202),
  });
  const intent = buildAutopilotStartIntent(sessionId, autopilotState(selected));
  const calls: string[] = [];

  assert.equal(intent.ok, true);

  if (!intent.ok) {
    return;
  }

  const result = await runAutopilotGoThere(intent, {
    async startCandidate(requestSessionId, candidateId) {
      calls.push(`start:${requestSessionId}:${candidateId}`);
    },
    async refreshCockpit(requestSessionId) {
      calls.push(`refresh:${requestSessionId}`);
      return {
        autopilot: {
          ...autopilotState(selected),
          focusState: {
            sessionId: requestSessionId,
            mode: "challenge",
            focusedClaimId: uuidAt(303),
            focusedEdgeId: null,
            source: "autopilot_started",
            suggestionMoveId: uuidAt(601),
            manualMoveId: null,
            paused: false,
            reason: "Started Check.",
            updatedAt: "2026-04-30T13:00:00.000Z",
          },
        },
      };
    },
  });

  assert.deepEqual(calls, [`start:${sessionId}:check-founder-risk`, `refresh:${sessionId}`]);
  assert.equal(calls.filter((call) => call.startsWith("refresh:")).length, 1);
  assert.equal(result.focusedClaimId, uuidAt(303));
  assert.equal(result.nextMode, "Check");
});

test("Check candidates open Check after Go There", () => {
  assert.equal(modeForAutopilotCandidate(candidate({ action: "challenge", mode: "challenge" })), "Check");
  assert.equal(modeForAutopilotCandidate(candidate({ action: "resume_open_challenge", mode: "challenge" })), "Check");
  assert.equal(modeForAutopilotCandidate(candidate({ action: "verify", mode: "verify" })), "Check");
});

test("Save candidates open the Brain save surface after Go There", () => {
  const sessionId = uuidAt(101);
  const checkCandidate = candidate({
    action: "challenge",
    mode: "challenge",
    candidateId: "check-founder-risk",
  });
  const saveCandidate = candidate({
    action: "save_to_brain",
    mode: "artifact",
    candidateId: "save-learn-output",
    primaryActionLabel: "Save to Brain",
  });
  const intent = buildAutopilotStartIntent(
    sessionId,
    {
      ...autopilotState(checkCandidate),
      candidates: [checkCandidate, saveCandidate],
    },
    "save-learn-output",
  );

  assert.equal(modeForAutopilotCandidate(saveCandidate), "Brain");
  assert.equal(intent.ok, true);

  if (!intent.ok) {
    return;
  }

  assert.equal(intent.candidateId, "save-learn-output");
  assert.equal(intent.nextMode, "Brain");
});

function autopilotState(suggestion: AutopilotSuggestion): AutopilotTickData {
  return {
    status: "ready",
    sessionId: uuidAt(101),
    suggestion,
    candidates: [suggestion],
    selectedCandidate: suggestion,
    focusState: {
      sessionId: uuidAt(101),
      mode: suggestion.mode,
      focusedClaimId: suggestion.targetClaimId,
      focusedEdgeId: suggestion.targetEdgeId,
      source: "autopilot_suggestion",
      suggestionMoveId: uuidAt(601),
      manualMoveId: null,
      paused: false,
      reason: suggestion.why,
      updatedAt: "2026-04-30T12:59:00.000Z",
    },
    move: {
      id: uuidAt(601),
      kind: "next_move_recomputed",
      summary: "Autopilot recomputed next moves.",
    },
  };
}

function candidate(overrides: Partial<AutopilotSuggestion> = {}): AutopilotSuggestion {
  return {
    id: uuidAt(701),
    candidateId: "next_candidate",
    action: "challenge",
    mode: "challenge",
    label: "Check the weakest claim",
    primaryActionLabel: "Start Check",
    targetClaimId: uuidAt(202),
    targetEdgeId: null,
    score: 900,
    why: "Check the fragile founder adoption assumption.",
    exitCriteria: {
      label: "A Check move is started.",
      acceptedMoveKinds: ["autopilot_focus_started"],
    },
    ...overrides,
  };
}

function claim(id: string, text: string): BrainClaim {
  return {
    id,
    text,
    kind: "assumption",
    status: "exploratory",
    confidence: 60,
  };
}

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
