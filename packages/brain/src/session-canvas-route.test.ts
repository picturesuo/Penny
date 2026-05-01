import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSessionCanvas,
  handleSessionCanvasRequest,
  SessionCanvasConflictError,
  SessionCanvasNotFoundError,
  type SessionCanvasPayload,
  type SessionCanvasState,
} from "./session-canvas-route.ts";
import type { BrainScope } from "./scope.ts";

const scope: BrainScope = {
  userId: "user-1",
  workspaceId: "workspace-1",
  projectId: "project-1",
  sphereId: "sphere-1",
};

test("GET /api/sessions/:sessionId/canvas validates the session id before persistence", async () => {
  let loaded = false;
  const response = await handleSessionCanvasRequest(new Request("http://localhost/api/sessions/nope/canvas"), "nope", {
    async loadSessionCanvas() {
      loaded = true;
      throw new Error("loadSessionCanvas should not run");
    },
  });
  const payload = (await response.json()) as { error: { code: string } };

  assert.equal(response.status, 400);
  assert.equal(payload.error.code, "invalid_session_id");
  assert.equal(loaded, false);
});

test("GET /api/sessions/:sessionId/canvas rejects non-GET methods", async () => {
  const response = await handleSessionCanvasRequest(
    new Request(`http://localhost/api/sessions/${uuidAt(101)}/canvas`, {
      method: "POST",
    }),
    uuidAt(101),
  );
  const payload = (await response.json()) as { error: { code: string } };

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET");
  assert.equal(payload.error.code, "method_not_allowed");
});

test("GET /api/sessions/:sessionId/canvas delegates with header scope", async () => {
  const sessionId = uuidAt(101);
  const canvas = buildSessionCanvas(sessionCanvasState(sessionId));
  const calls: Array<{ sessionId: string; scope: BrainScope }> = [];
  const response = await handleSessionCanvasRequest(scopedRequest(`http://localhost/api/sessions/${sessionId}/canvas`), sessionId, {
    async loadSessionCanvas(targetSessionId, requestScope) {
      calls.push({ sessionId: targetSessionId, scope: requestScope });
      return canvas;
    },
  });
  const payload = (await response.json()) as { data: SessionCanvasPayload };

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [{ sessionId, scope }]);
  assert.equal(payload.data.nodes[0]?.id, `claim:${uuidAt(201)}`);
});

test("session canvas maps claims, claim_edges, Brain objects, and next moves into the canvas contract", () => {
  const sessionId = uuidAt(101);
  const canvas = buildSessionCanvas(sessionCanvasState(sessionId));

  assert.equal(canvas.nodes.length, 3);
  assert.deepEqual(canvas.nodes.map((node) => node.id), [
    `claim:${uuidAt(201)}`,
    `claim:${uuidAt(202)}`,
    `brain_object:${uuidAt(801)}`,
  ]);
  assert.equal(canvas.nodes[0]?.kind, "assumption");
  assert.equal(canvas.nodes[0]?.summary, "Students need a low-friction map before deeper critique.");
  assert.equal(canvas.nodes[0]?.confidence, 62);
  assert.deepEqual(canvas.nodes[0]?.refs, { claimId: uuidAt(201), sourceId: uuidAt(151) });
  assert.deepEqual(canvas.edges, [
    {
      id: `edge:${uuidAt(401)}`,
      source: `claim:${uuidAt(202)}`,
      target: `claim:${uuidAt(201)}`,
      kind: "challenges",
      label: "pushes back on",
    },
  ]);
  assert.deepEqual(canvas.recommendedPath, [`claim:${uuidAt(201)}`, `claim:${uuidAt(202)}`]);
  assert.equal(canvas.selectedNodeId, `claim:${uuidAt(202)}`);
});

test("session canvas reports conflicts when a claim has no current version", () => {
  const state = sessionCanvasState(uuidAt(101));

  assert.throws(
    () =>
      buildSessionCanvas({
        ...state,
        claimVersions: state.claimVersions.filter((version) => version.claimId !== uuidAt(201)),
      }),
    SessionCanvasConflictError,
  );
});

test("GET /api/sessions/:sessionId/canvas maps missing sessions and conflicts to stable errors", async () => {
  const sessionId = uuidAt(101);
  const notFound = await handleSessionCanvasRequest(scopedRequest(`http://localhost/api/sessions/${sessionId}/canvas`), sessionId, {
    async loadSessionCanvas() {
      throw new SessionCanvasNotFoundError("Session was not found in this scope.");
    },
  });
  const conflict = await handleSessionCanvasRequest(scopedRequest(`http://localhost/api/sessions/${sessionId}/canvas`), sessionId, {
    async loadSessionCanvas() {
      throw new SessionCanvasConflictError("Claim has no current ClaimVersion.");
    },
  });
  const notFoundPayload = (await notFound.json()) as { error: { code: string } };
  const conflictPayload = (await conflict.json()) as { error: { code: string } };

  assert.equal(notFound.status, 404);
  assert.equal(notFoundPayload.error.code, "session_not_found");
  assert.equal(conflict.status, 409);
  assert.equal(conflictPayload.error.code, "session_canvas_conflict");
});

function sessionCanvasState(sessionId: string): SessionCanvasState {
  const sourceId = uuidAt(151);
  const assumptionClaimId = uuidAt(201);
  const critiqueClaimId = uuidAt(202);
  const assumptionVersionId = uuidAt(301);
  const critiqueVersionId = uuidAt(302);

  return {
    session: {
      id: sessionId,
      ...scope,
      status: "open",
      title: "Penny should help students study.",
      createdAt: dateAt(1),
      endedAt: null,
    },
    claims: [
      {
        id: assumptionClaimId,
        ...scope,
        sessionId,
        sourceId,
        kind: "assumption",
        createdAt: dateAt(2),
      },
      {
        id: critiqueClaimId,
        ...scope,
        sessionId,
        sourceId,
        kind: "belief",
        createdAt: dateAt(3),
      },
    ],
    claimVersions: [
      {
        id: assumptionVersionId,
        claimId: assumptionClaimId,
        sourceId,
        brainRunId: null,
        moveId: null,
        content: "Students need a low-friction map before deeper critique.",
        status: "exploratory",
        confidence: 62,
        isCurrent: true,
        validFrom: dateAt(2),
        validUntil: null,
        supersededByVersionId: null,
        createdAt: dateAt(2),
      },
      {
        id: critiqueVersionId,
        claimId: critiqueClaimId,
        sourceId,
        brainRunId: null,
        moveId: null,
        content: "The map could become visual clutter.",
        status: "exploratory",
        confidence: 48,
        isCurrent: true,
        validFrom: dateAt(3),
        validUntil: null,
        supersededByVersionId: null,
        createdAt: dateAt(3),
      },
    ],
    edges: [
      {
        id: uuidAt(401),
        ...scope,
        sessionId,
        fromClaimId: critiqueClaimId,
        toClaimId: assumptionClaimId,
        kind: "challenges",
        status: "active",
        label: "pushes back on",
        createdAt: dateAt(4),
      },
    ],
    brainObjects: [
      {
        id: uuidAt(801),
        ...scope,
        sessionId,
        sourceRecentId: null,
        objectType: "artifact",
        title: "Challenge brief",
        summary: "A saved summary of the session pressure test.",
        body: "A saved summary of the session pressure test.",
        payload: {},
        createdAt: dateAt(5),
        updatedAt: dateAt(5),
      },
    ],
    focusState: {
      sessionId,
      ...scope,
      mode: "challenge",
      focusedClaimId: critiqueClaimId,
      focusedEdgeId: uuidAt(401),
      source: "autopilot_suggestion",
      suggestionMoveId: uuidAt(601),
      manualMoveId: null,
      paused: false,
      reason: "Autopilot suggested the critique.",
      updatedAt: dateAt(6),
    },
    nextMoveCandidates: [
      {
        id: uuidAt(901),
        ...scope,
        sessionId,
        candidateId: "next_candidate",
        fingerprint: "fingerprint_1",
        graphHash: "hash_1",
        action: "challenge",
        mode: "challenge",
        targetClaimId: assumptionClaimId,
        targetEdgeId: uuidAt(401),
        score: 920,
        rank: 1,
        reason: "Challenge the weakest assumption.",
        reasonCodes: ["low_confidence"],
        exitCriteria: {},
        scoreBreakdown: {},
        provenance: { claimIds: [critiqueClaimId] },
        selected: true,
        selectedAt: dateAt(6),
        createdAt: dateAt(6),
        updatedAt: dateAt(6),
      },
    ],
    moves: [],
  };
}

function scopedRequest(url: string): Request {
  return new Request(url, { headers: scopeHeaders(scope) });
}

function scopeHeaders(requestScope: BrainScope): Record<string, string> {
  return {
    "x-user-id": requestScope.userId ?? "",
    "x-workspace-id": requestScope.workspaceId ?? "",
    "x-project-id": requestScope.projectId ?? "",
    "x-sphere-id": requestScope.sphereId ?? "",
  };
}

function dateAt(second: number): Date {
  return new Date(`2026-04-30T00:00:${String(second).padStart(2, "0")}.000Z`);
}

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
