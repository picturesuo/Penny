import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSessionMovesTimeline,
  handleSessionMovesRequest,
  SessionMovesNotFoundError,
  type SessionMovesPayload,
  type SessionMovesState,
} from "./session-moves-route.ts";

test("GET /brain/session/:sessionId/moves validates the session id", async () => {
  let loaded = false;
  const response = await handleSessionMovesRequest(new Request("http://localhost/brain/session/nope/moves"), "nope", {
    async loadSessionMoves() {
      loaded = true;
      throw new Error("loadSessionMoves should not run");
    },
  });
  const payload = (await response.json()) as { error: { code: string } };

  assert.equal(response.status, 400);
  assert.equal(payload.error.code, "invalid_session_id");
  assert.equal(loaded, false);
});

test("GET /brain/session/:sessionId/moves rejects non-GET methods", async () => {
  const response = await handleSessionMovesRequest(
    new Request("http://localhost/brain/session/00000000-0000-4000-8000-000000000101/moves", {
      method: "POST",
    }),
    uuidAt(101),
  );
  const payload = (await response.json()) as { error: { code: string } };

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET");
  assert.equal(payload.error.code, "method_not_allowed");
});

test("GET /brain/session/:sessionId/moves returns the injected persisted timeline", async () => {
  const sessionId = uuidAt(101);
  const timeline = buildSessionMovesTimeline(sessionMovesState(sessionId));
  const response = await handleSessionMovesRequest(new Request(`http://localhost/brain/session/${sessionId}/moves`), sessionId, {
    async loadSessionMoves(targetSessionId) {
      assert.equal(targetSessionId, sessionId);
      return timeline;
    },
  });
  const payload = (await response.json()) as { data: SessionMovesPayload };

  assert.equal(response.status, 200);
  assert.equal(payload.data.session.id, sessionId);
  assert.deepEqual(
    payload.data.moves.map((move) => move.type),
    ["source.recorded", "assumption_refined", "challenge_issued"],
  );
});

test("session moves timeline enriches moves without inventing rows", () => {
  const sessionId = uuidAt(101);
  const payload = buildSessionMovesTimeline(sessionMovesState(sessionId));
  const [sourceRecorded, refined, challenge] = payload.moves;

  assert.equal(sourceRecorded?.actor, "User");
  assert.equal(sourceRecorded?.details.source?.kind, "raw_idea");
  assert.equal(sourceRecorded?.details.sourceSpan?.label, "submitted_text");

  assert.equal(refined?.actor, "User");
  assert.equal(refined?.affectedClaim?.id, uuidAt(201));
  assert.equal(refined?.details.oldVersion?.content, "Students will tolerate a complex map.");
  assert.equal(refined?.details.oldVersion?.supersededByVersionId, uuidAt(302));
  assert.equal(refined?.details.newVersion?.content, "Students need a low-friction map before deeper critique.");
  assert.equal(refined?.details.newVersion?.validUntil, null);
  assert.equal(refined?.payloadPreview.currentVersionId, uuidAt(302).slice(0, 8));

  assert.equal(challenge?.actor, "Penny");
  assert.equal(challenge?.affectedEdge?.kind, "challenges");
  assert.equal(challenge?.details.brainRun?.operation, "brain.challenge");
  assert.deepEqual(challenge?.affected.edges.map((edge) => edge.id), [uuidAt(401)]);
});

test("GET /brain/session/:sessionId/moves maps missing sessions to 404", async () => {
  const sessionId = uuidAt(101);
  const response = await handleSessionMovesRequest(new Request(`http://localhost/brain/session/${sessionId}/moves`), sessionId, {
    async loadSessionMoves() {
      throw new SessionMovesNotFoundError("Session was not found.");
    },
  });
  const payload = (await response.json()) as { error: { code: string } };

  assert.equal(response.status, 404);
  assert.equal(payload.error.code, "session_not_found");
});

function sessionMovesState(sessionId: string): SessionMovesState {
  const sourceId = uuidAt(151);
  const sourceSpanId = uuidAt(161);
  const claimId = uuidAt(201);
  const critiqueClaimId = uuidAt(202);
  const oldVersionId = uuidAt(301);
  const currentVersionId = uuidAt(302);
  const critiqueVersionId = uuidAt(303);
  const challengeEdgeId = uuidAt(401);
  const seedRunId = uuidAt(701);
  const challengeRunId = uuidAt(702);

  return {
    session: {
      id: sessionId,
      status: "open",
      title: "Penny should help students study.",
      createdAt: dateAt(1),
      endedAt: null,
    },
    sources: [
      {
        id: sourceId,
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
        claimId: null,
        claimVersionId: null,
        startOffset: 0,
        endOffset: 34,
        label: "submitted_text",
        createdAt: dateAt(1),
      },
    ],
    claims: [
      {
        id: claimId,
        sessionId,
        sourceId,
        kind: "assumption",
        createdAt: dateAt(2),
      },
      {
        id: critiqueClaimId,
        sessionId,
        sourceId,
        kind: "belief",
        createdAt: dateAt(4),
      },
    ],
    claimVersions: [
      {
        id: oldVersionId,
        claimId,
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
        claimId,
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
        brainRunId: challengeRunId,
        moveId: uuidAt(503),
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
        sessionId,
        fromClaimId: critiqueClaimId,
        toClaimId: claimId,
        kind: "challenges",
        status: "active",
        label: "shaky_assumption",
        createdAt: dateAt(4),
      },
    ],
    brainRuns: [
      {
        id: seedRunId,
        sessionId,
        sourceId,
        operation: "brain.seed",
        provider: "heuristic",
        model: null,
        status: "succeeded",
        input: { rawIdea: "Penny should help students study." },
        output: {},
        error: null,
        createdAt: dateAt(1),
        completedAt: dateAt(2),
      },
      {
        id: challengeRunId,
        sessionId,
        sourceId,
        operation: "brain.challenge",
        provider: "heuristic",
        model: null,
        status: "succeeded",
        input: { targetClaimId: claimId },
        output: { failureType: "shaky_assumption" },
        error: null,
        createdAt: dateAt(4),
        completedAt: dateAt(5),
      },
    ],
    moves: [
      {
        id: uuidAt(503),
        sessionId,
        kind: "challenge_issued",
        summary: "Issued a challenge.",
        payload: {
          claimIds: [claimId, critiqueClaimId],
          edgeIds: [challengeEdgeId],
          targetClaimId: claimId,
          targetClaimVersionId: currentVersionId,
          critiqueClaimId,
          critiqueClaimVersionId: critiqueVersionId,
          challengeEdgeId,
          brainRunId: challengeRunId,
          failureType: "shaky_assumption",
          strength: "moderate",
        },
        createdAt: dateAt(4),
      },
      {
        id: uuidAt(501),
        sessionId,
        kind: "source.recorded",
        summary: "Submitted the raw seed idea.",
        payload: {
          sourceIds: [sourceId],
          sourceSpanIds: [sourceSpanId],
          brainRunId: seedRunId,
        },
        createdAt: dateAt(1),
      },
      {
        id: uuidAt(502),
        sessionId,
        kind: "assumption_refined",
        summary: "Refined an assumption.",
        payload: {
          action: "refine",
          claimId,
          previousVersionId: oldVersionId,
          currentVersionId,
        },
        createdAt: dateAt(3),
      },
    ],
  };
}

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

function dateAt(value: number): Date {
  return new Date(`2026-04-27T00:00:0${value}.000Z`);
}
