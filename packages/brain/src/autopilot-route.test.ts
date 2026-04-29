import assert from "node:assert/strict";
import test from "node:test";
import {
  AutopilotConflictError,
  AutopilotNotFoundError,
  handleAutopilotTickRequest,
  handleManualNodeSelectedRequest,
  type AutopilotTickRequest,
  type ManualNodeSelectedRequest,
} from "./autopilot-route.ts";
import { parseMovePayload } from "./move-payloads.ts";

test("POST /autopilot/tick rejects GET before persistence", async () => {
  let called = false;
  const response = await handleAutopilotTickRequest(new Request("http://localhost/autopilot/tick"), {
    async tickAutopilot() {
      called = true;
      throw new Error("tickAutopilot should not run");
    },
  });
  const payload = (await response.json()) as { error: { code: string } };

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
  assert.equal(payload.error.code, "method_not_allowed");
  assert.equal(called, false);
});

test("POST /autopilot/tick validates the request body before persistence", async () => {
  let called = false;
  const response = await handleAutopilotTickRequest(
    new Request("http://localhost/autopilot/tick", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ sessionId: "not-a-uuid" }),
    }),
    {
      async tickAutopilot() {
        called = true;
        throw new Error("tickAutopilot should not run");
      },
    },
  );
  const payload = (await response.json()) as { error: { code: string; issues: string[] } };

  assert.equal(response.status, 400);
  assert.equal(payload.error.code, "invalid_request");
  assert.match(payload.error.issues.join("\n"), /sessionId/);
  assert.equal(called, false);
});

test("POST /autopilot/tick returns the persisted suggestion from the command layer", async () => {
  let ticked: AutopilotTickRequest | undefined;
  const response = await handleAutopilotTickRequest(
    requestWithBody("http://localhost/autopilot/tick", {
      sessionId: uuidAt(101),
    }),
    {
      async tickAutopilot(input) {
        ticked = input;

        return {
          status: "ready",
          sessionId: input.sessionId,
          suggestion: suggestion(input.sessionId),
          candidates: [
            {
              ...suggestion(input.sessionId),
              priority: 1,
            },
          ],
          move: {
            id: uuidAt(901),
            kind: "autopilot_suggested",
            summary: "Autopilot suggested: Answer open challenge.",
            claimIds: [uuidAt(201)],
            edgeIds: [uuidAt(401)],
            artifactIds: [],
          },
          pause: {
            paused: false,
            manualMoveId: null,
            focusedClaimId: null,
            pausedAt: null,
          },
        };
      },
    },
  );
  const payload = (await response.json()) as {
    data: {
      status: string;
      suggestion: { action: string; goThere: { label: string; targetClaimId: string } };
      move: { kind: string; claimIds: string[] };
    };
  };

  assert.equal(response.status, 201);
  assert.equal(ticked?.sessionId, uuidAt(101));
  assert.equal(ticked?.resume, false);
  assert.equal(payload.data.status, "ready");
  assert.equal(payload.data.suggestion.action, "respond_to_challenge");
  assert.equal(payload.data.suggestion.goThere.label, "Go there");
  assert.deepEqual(payload.data.move.claimIds, [uuidAt(201)]);
});

test("POST /autopilot/select-node returns a paused manual selection move", async () => {
  let selected: ManualNodeSelectedRequest | undefined;
  const response = await handleManualNodeSelectedRequest(
    requestWithBody("http://localhost/autopilot/select-node", {
      sessionId: uuidAt(101),
      claimId: uuidAt(202),
      reason: "I want to inspect the assumption first.",
    }),
    {
      async selectManualNode(input) {
        selected = input;

        return {
          status: "paused",
          sessionId: input.sessionId,
          focusClaim: {
            id: input.claimId,
            versionId: uuidAt(302),
            kind: "assumption",
            status: "exploratory",
            text: "Users trust explicit reasoning for navigation.",
            confidence: 54,
          },
          move: {
            id: uuidAt(902),
            kind: "manual_node_selected",
            summary: "User manually selected a graph node and paused autopilot.",
            claimIds: [input.claimId],
            edgeIds: [uuidAt(301)],
            artifactIds: [],
          },
          pause: {
            paused: true,
            manualMoveId: uuidAt(902),
            focusedClaimId: input.claimId,
            pausedAt: "2026-04-29T00:00:02.000Z",
          },
        };
      },
    },
  );
  const payload = (await response.json()) as {
    data: {
      status: string;
      focusClaim: { id: string };
      move: { kind: string };
      pause: { paused: boolean };
    };
  };

  assert.equal(response.status, 201);
  assert.equal(selected?.claimId, uuidAt(202));
  assert.equal(payload.data.status, "paused");
  assert.equal(payload.data.focusClaim.id, uuidAt(202));
  assert.equal(payload.data.move.kind, "manual_node_selected");
  assert.equal(payload.data.pause.paused, true);
});

test("autopilot route maps domain errors to stable status codes", async () => {
  const notFound = await handleAutopilotTickRequest(requestWithBody("http://localhost/autopilot/tick", { sessionId: uuidAt(101) }), {
    async tickAutopilot() {
      throw new AutopilotNotFoundError("Autopilot session was not found.");
    },
  });
  const conflict = await handleAutopilotTickRequest(requestWithBody("http://localhost/autopilot/tick", { sessionId: uuidAt(101) }), {
    async tickAutopilot() {
      throw new AutopilotConflictError("Autopilot can only tick open sessions.");
    },
  });
  const notFoundPayload = (await notFound.json()) as { error: { code: string } };
  const conflictPayload = (await conflict.json()) as { error: { code: string } };

  assert.equal(notFound.status, 404);
  assert.equal(notFoundPayload.error.code, "autopilot_not_found");
  assert.equal(conflict.status, 409);
  assert.equal(conflictPayload.error.code, "autopilot_conflict");
});

test("autopilot move payloads validate the persisted suggestion and manual override contracts", () => {
  assert.equal(
    parseMovePayload("autopilot_suggested", {
      suggestionId: uuidAt(901),
      action: "respond_to_challenge",
      mode: "challenge",
      label: "Answer open challenge",
      targetClaimId: uuidAt(201),
      targetEdgeId: uuidAt(401),
      score: 1000,
      why: "An active critique is waiting for Defend, Revise, or Absorb.",
      reasonCodes: ["open_challenge"],
      candidateScores: [
        {
          action: "respond_to_challenge",
          mode: "challenge",
          targetClaimId: uuidAt(201),
          targetEdgeId: uuidAt(401),
          score: 1000,
          reasonCodes: ["open_challenge"],
        },
      ],
      goThere: {
        label: "Go there",
        targetClaimId: uuidAt(201),
        targetEdgeId: uuidAt(401),
        mode: "challenge",
      },
      claimIds: [uuidAt(201)],
      edgeIds: [uuidAt(401)],
      artifactIds: [],
    }).action,
    "respond_to_challenge",
  );

  assert.equal(
    parseMovePayload("manual_node_selected", {
      claimId: uuidAt(202),
      previousSuggestionMoveId: uuidAt(901),
      reason: "Inspect this assumption first.",
      pauseAutopilot: true,
      claimIds: [uuidAt(202)],
      edgeIds: [uuidAt(301)],
      artifactIds: [],
    }).pauseAutopilot,
    true,
  );
});

function suggestion(sessionId: string) {
  return {
    id: `respond_to_challenge:${uuidAt(201)}:${uuidAt(401)}`,
    sessionId,
    action: "respond_to_challenge" as const,
    mode: "challenge" as const,
    title: "Answer open challenge",
    label: "Answer open challenge",
    rationale: "An active critique is waiting for Defend, Revise, or Absorb.",
    targetClaimId: uuidAt(201),
    challengeEdgeId: uuidAt(401),
    targetEdgeId: uuidAt(401),
    artifactKind: null,
    score: 1000,
    priority: 1,
    autopilotPaused: false,
    goThereLabel: "Go to challenge",
    whyChosen: ["An active challenge blocks the loop."],
    reasonCodes: ["open_challenge", "defend_revise_absorb_required"],
    why: "An active critique is waiting for Defend, Revise, or Absorb.",
    goThere: {
      label: "Go there" as const,
      targetClaimId: uuidAt(201),
      targetEdgeId: uuidAt(401),
      mode: "challenge" as const,
    },
  };
}

function requestWithBody(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}
