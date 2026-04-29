import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSessionGraph,
  handleSessionGraphRequest,
  SessionGraphConflictError,
  SessionGraphNotFoundError,
  type SessionGraphPayload,
  type SessionGraphState,
} from "./session-graph-route.ts";

test("GET /brain/session/:sessionId/graph validates the session id before persistence", async () => {
  let loaded = false;
  const response = await handleSessionGraphRequest(new Request("http://localhost/brain/session/nope/graph"), "nope", {
    async loadSessionGraph() {
      loaded = true;
      throw new Error("loadSessionGraph should not run");
    },
  });
  const payload = (await response.json()) as { error: { code: string } };

  assert.equal(response.status, 400);
  assert.equal(payload.error.code, "invalid_session_id");
  assert.equal(loaded, false);
});

test("GET /brain/session/:sessionId/graph rejects non-GET methods", async () => {
  const response = await handleSessionGraphRequest(
    new Request(`http://localhost/brain/session/${uuidAt(101)}/graph`, {
      method: "POST",
    }),
    uuidAt(101),
  );
  const payload = (await response.json()) as { error: { code: string } };

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET");
  assert.equal(payload.error.code, "method_not_allowed");
});

test("GET /brain/session/:sessionId/graph returns the injected persisted graph", async () => {
  const sessionId = uuidAt(101);
  const graph = buildSessionGraph(sessionGraphState(sessionId));
  const response = await handleSessionGraphRequest(new Request(`http://localhost/brain/session/${sessionId}/graph`), sessionId, {
    async loadSessionGraph(targetSessionId) {
      assert.equal(targetSessionId, sessionId);
      return graph;
    },
  });
  const payload = (await response.json()) as { data: SessionGraphPayload };

  assert.equal(response.status, 200);
  assert.equal(payload.data.session.id, sessionId);
  assert.equal(payload.data.ideaMap.claims.length, 2);
  assert.equal(payload.data.graph.nodes.length, 2);
  assert.equal(payload.data.graph.edges.length, 1);
});

test("session graph exposes current claims, old versions, persisted edges, moves, provenance, and lens data", () => {
  const sessionId = uuidAt(101);
  const graph = buildSessionGraph(sessionGraphState(sessionId));
  const assumption = graph.ideaMap.claims.find((claim) => claim.id === uuidAt(201));
  const critique = graph.ideaMap.claims.find((claim) => claim.id === uuidAt(202));
  const edge = graph.ideaMap.edges[0];
  const acceptedMove = graph.moves.find((move) => move.kind === "confidence_update_accepted");

  assert.equal(graph.session.scope.userId, "user-1");
  assert.equal(graph.sourceOfTruth, "claims_claim_versions_edges_moves_sources_source_spans");
  assert.equal(graph.meta.claimVersionCount, 3);

  assert.equal(assumption?.text, "Students need a low-friction map before deeper critique.");
  assert.equal(assumption?.versionId, uuidAt(302));
  assert.equal(assumption?.currentVersion.validUntil, null);
  assert.deepEqual(
    assumption?.versions.map((version) => [version.id, version.state, version.validUntil, version.supersededByVersionId]),
    [
      [uuidAt(301), "old", "2026-04-27T00:00:03.000Z", uuidAt(302)],
      [uuidAt(302), "current", null, null],
    ],
  );
  assert.deepEqual(assumption?.incomingEdgeIds, [uuidAt(401)]);
  assert.deepEqual(critique?.outgoingEdgeIds, [uuidAt(401)]);

  assert.equal(edge?.fromClaimId, uuidAt(202));
  assert.equal(edge?.toClaimId, uuidAt(201));
  assert.equal(edge?.fromClaimVersionId, uuidAt(303));
  assert.equal(edge?.toClaimVersionId, uuidAt(302));
  assert.deepEqual(
    graph.ideaMap.edges.map((candidate) => candidate.id),
    [uuidAt(401)],
  );

  assert.deepEqual(acceptedMove?.edgeIds, [uuidAt(401)]);
  assert.deepEqual(acceptedMove?.claimVersionIds, [uuidAt(302), uuidAt(303)]);
  assert.deepEqual(acceptedMove?.artifactIds, [uuidAt(801)]);
  assert.equal(graph.sourceSpans[0]?.text, "Penny");
  assert.equal(graph.lensSnapshot.shapes[0]?.label, "Challenge response loop");
  assert.equal(graph.lensSnapshot.pendingEffects[0]?.kind, "shape_candidate");
});

test("session graph reports conflicts when a claim has no current version", () => {
  const state = sessionGraphState(uuidAt(101));

  assert.throws(
    () =>
      buildSessionGraph({
        ...state,
        claimVersions: state.claimVersions.filter((version) => version.id !== uuidAt(302)),
      }),
    SessionGraphConflictError,
  );
});

test("GET /brain/session/:sessionId/graph maps missing sessions and graph conflicts to stable errors", async () => {
  const sessionId = uuidAt(101);
  const notFound = await handleSessionGraphRequest(new Request(`http://localhost/brain/session/${sessionId}/graph`), sessionId, {
    async loadSessionGraph() {
      throw new SessionGraphNotFoundError("Session was not found.");
    },
  });
  const conflict = await handleSessionGraphRequest(new Request(`http://localhost/brain/session/${sessionId}/graph`), sessionId, {
    async loadSessionGraph() {
      throw new SessionGraphConflictError("Claim has no current ClaimVersion.");
    },
  });
  const notFoundPayload = (await notFound.json()) as { error: { code: string } };
  const conflictPayload = (await conflict.json()) as { error: { code: string } };

  assert.equal(notFound.status, 404);
  assert.equal(notFoundPayload.error.code, "session_not_found");
  assert.equal(conflict.status, 409);
  assert.equal(conflictPayload.error.code, "session_graph_conflict");
});

function sessionGraphState(sessionId: string): SessionGraphState {
  const sourceId = uuidAt(151);
  const sourceSpanId = uuidAt(161);
  const assumptionClaimId = uuidAt(201);
  const critiqueClaimId = uuidAt(202);
  const oldVersionId = uuidAt(301);
  const currentVersionId = uuidAt(302);
  const critiqueVersionId = uuidAt(303);
  const challengeEdgeId = uuidAt(401);
  const acceptedMoveId = uuidAt(503);

  return {
    session: {
      id: sessionId,
      userId: "user-1",
      workspaceId: "workspace-1",
      projectId: "project-1",
      sphereId: "sphere-1",
      status: "open",
      title: "Penny should help students study.",
      createdAt: dateAt(1),
      endedAt: null,
    },
    sources: [
      {
        id: sourceId,
        userId: "user-1",
        workspaceId: "workspace-1",
        projectId: "project-1",
        sphereId: "sphere-1",
        sessionId,
        kind: "raw_idea",
        rawText: "Penny should help students study.",
        createdAt: dateAt(1),
      },
    ],
    sourceSpans: [
      {
        id: sourceSpanId,
        sourceId,
        claimId: assumptionClaimId,
        claimVersionId: currentVersionId,
        startOffset: 0,
        endOffset: 5,
        label: "submitted_text",
        createdAt: dateAt(1),
      },
    ],
    claims: [
      {
        id: assumptionClaimId,
        userId: "user-1",
        workspaceId: "workspace-1",
        projectId: "project-1",
        sphereId: "sphere-1",
        sessionId,
        sourceId,
        kind: "assumption",
        createdAt: dateAt(2),
      },
      {
        id: critiqueClaimId,
        userId: "user-1",
        workspaceId: "workspace-1",
        projectId: "project-1",
        sphereId: "sphere-1",
        sessionId,
        sourceId,
        kind: "belief",
        createdAt: dateAt(4),
      },
    ],
    claimVersions: [
      {
        id: oldVersionId,
        claimId: assumptionClaimId,
        sourceId,
        brainRunId: null,
        moveId: null,
        content: "Students will tolerate a complex map.",
        status: "exploratory",
        confidence: 54,
        isCurrent: false,
        validFrom: dateAt(2),
        validUntil: dateAt(3),
        supersededByVersionId: currentVersionId,
        createdAt: dateAt(2),
      },
      {
        id: currentVersionId,
        claimId: assumptionClaimId,
        sourceId,
        brainRunId: null,
        moveId: uuidAt(502),
        content: "Students need a low-friction map before deeper critique.",
        status: "exploratory",
        confidence: 66,
        isCurrent: true,
        validFrom: dateAt(3),
        validUntil: null,
        supersededByVersionId: null,
        createdAt: dateAt(3),
      },
      {
        id: critiqueVersionId,
        claimId: critiqueClaimId,
        sourceId,
        brainRunId: uuidAt(702),
        moveId: uuidAt(501),
        content: "The map may add load before it reduces it.",
        status: "exploratory",
        confidence: 72,
        isCurrent: true,
        validFrom: dateAt(4),
        validUntil: null,
        supersededByVersionId: null,
        createdAt: dateAt(4),
      },
    ],
    edges: [
      {
        id: challengeEdgeId,
        userId: "user-1",
        workspaceId: "workspace-1",
        projectId: "project-1",
        sphereId: "sphere-1",
        sessionId,
        fromClaimId: critiqueClaimId,
        toClaimId: assumptionClaimId,
        kind: "challenges",
        status: "active",
        label: "shaky_assumption",
        createdAt: dateAt(4),
      },
    ],
    moves: [
      {
        id: uuidAt(501),
        userId: "user-1",
        workspaceId: "workspace-1",
        projectId: "project-1",
        sphereId: "sphere-1",
        sessionId,
        kind: "challenge_issued",
        summary: "Issued a challenge.",
        payload: {
          claimIds: [assumptionClaimId, critiqueClaimId],
          edgeIds: [challengeEdgeId],
          targetClaimId: assumptionClaimId,
          targetClaimVersionId: currentVersionId,
          critiqueClaimId,
          critiqueClaimVersionId: critiqueVersionId,
          challengeEdgeId,
          brainRunId: uuidAt(702),
        },
        createdAt: dateAt(4),
      },
      {
        id: uuidAt(502),
        userId: "user-1",
        workspaceId: "workspace-1",
        projectId: "project-1",
        sphereId: "sphere-1",
        sessionId,
        kind: "assumption_refined",
        summary: "Refined an assumption.",
        payload: {
          claimId: assumptionClaimId,
          previousVersionId: oldVersionId,
          currentVersionId,
          sourceSpanIds: [sourceSpanId],
        },
        createdAt: dateAt(3),
      },
      {
        id: acceptedMoveId,
        userId: "user-1",
        workspaceId: "workspace-1",
        projectId: "project-1",
        sphereId: "sphere-1",
        sessionId,
        kind: "confidence_update_accepted",
        summary: "Accepted a confidence update.",
        payload: {
          claimIds: [assumptionClaimId],
          claimVersionIds: [currentVersionId],
          edgeIds: [challengeEdgeId, uuidAt(999)],
          artifactId: uuidAt(801),
          cascade: [
            {
              viaEdgeId: challengeEdgeId,
              currentVersionId: critiqueVersionId,
            },
          ],
        },
        createdAt: dateAt(5),
      },
    ],
    shapes: [
      {
        id: uuidAt(901),
        userId: "user-1",
        workspaceId: "workspace-1",
        projectId: "project-1",
        sphereId: "sphere-1",
        sessionId,
        sourceMoveId: acceptedMoveId,
        key: "challenge_response_loop",
        status: "confirmed",
        version: 1,
        label: "Challenge response loop",
        description: "Recent moves are pressure-testing claims through challenge and explicit response.",
        confidence: 78,
        supportingMoveIds: [uuidAt(501), acceptedMoveId],
        payload: {},
        createdAt: dateAt(6),
        reviewedAt: dateAt(7),
      },
    ],
    pendingEffects: [
      {
        id: uuidAt(902),
        sessionId,
        sourceMoveId: acceptedMoveId,
        kind: "shape_candidate",
        status: "pending_review",
        version: 1,
        title: "Evidence checking",
        summary: "Recent moves are checking claims against evidence.",
        payload: { key: "evidence_checking" },
        createdAt: dateAt(8),
        reviewedAt: null,
      },
    ],
  };
}

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

function dateAt(value: number): Date {
  return new Date(`2026-04-27T00:00:${String(value).padStart(2, "0")}.000Z`);
}
