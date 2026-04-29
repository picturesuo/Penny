import assert from "node:assert/strict";
import test from "node:test";
import {
  handleChallengeBriefRequest,
  type ChallengeBriefRouteService,
} from "./routes/challenge-brief-routes.ts";
import {
  ChallengeBriefConflictError,
  ChallengeBriefNotFoundError,
  type ChallengeBriefResponse,
} from "./services/challenge-brief-service.ts";

test("POST /api/sessions/:sessionId/challenge-brief returns a created artifact and artifact_created move", async () => {
  const calls: string[] = [];
  const sessionId = uuidAt(101);
  const response = await handleChallengeBriefRequest(request(`http://localhost/api/sessions/${sessionId}/challenge-brief`, {}), sessionId, {
    service: routeService(calls),
  });
  const payload = (await response.json()) as {
    data: {
      status: string;
      artifact: { kind: string; payload: { sections: Record<string, unknown> } };
      move: { kind: string; artifactIds: string[] };
    };
  };

  assert.equal(response.status, 201);
  assert.deepEqual(calls, [sessionId]);
  assert.equal(payload.data.status, "created");
  assert.equal(payload.data.artifact.kind, "challenge_brief");
  assert.equal(Object.keys(payload.data.artifact.payload.sections).length, 11);
  assert.equal(payload.data.move.kind, "artifact_created");
  assert.deepEqual(payload.data.move.artifactIds, [uuidAt(900)]);
});

test("challenge brief route rejects non-POST, invalid session ids, and non-empty bodies before service calls", async () => {
  const calls: string[] = [];
  const nonPost = await handleChallengeBriefRequest(new Request(`http://localhost/api/sessions/${uuidAt(101)}/challenge-brief`), uuidAt(101), {
    service: routeService(calls),
  });
  const invalidSession = await handleChallengeBriefRequest(
    request("http://localhost/api/sessions/not-a-uuid/challenge-brief", {}),
    "not-a-uuid",
    { service: routeService(calls) },
  );
  const nonEmptyBody = await handleChallengeBriefRequest(
    request(`http://localhost/api/sessions/${uuidAt(101)}/challenge-brief`, { extra: true }),
    uuidAt(101),
    { service: routeService(calls) },
  );
  const nonPostPayload = (await nonPost.json()) as { error: { code: string } };
  const invalidPayload = (await invalidSession.json()) as { error: { code: string; issues: string[] } };
  const bodyPayload = (await nonEmptyBody.json()) as { error: { code: string; issues: string[] } };

  assert.equal(nonPost.status, 405);
  assert.equal(nonPost.headers.get("allow"), "POST");
  assert.equal(nonPostPayload.error.code, "method_not_allowed");
  assert.equal(invalidSession.status, 400);
  assert.equal(invalidPayload.error.code, "invalid_request");
  assert.match(invalidPayload.error.issues.join("\n"), /sessionId/);
  assert.equal(nonEmptyBody.status, 400);
  assert.equal(bodyPayload.error.code, "invalid_request");
  assert.match(bodyPayload.error.issues.join("\n"), /Unrecognized key/);
  assert.deepEqual(calls, []);
});

test("challenge brief route maps not-found and conflict failures", async () => {
  const notFound = await handleChallengeBriefRequest(
    request(`http://localhost/api/sessions/${uuidAt(101)}/challenge-brief`, {}),
    uuidAt(101),
    {
      service: {
        async generateChallengeBrief() {
          throw new ChallengeBriefNotFoundError("Session was not found.");
        },
      },
    },
  );
  const conflict = await handleChallengeBriefRequest(
    request(`http://localhost/api/sessions/${uuidAt(101)}/challenge-brief`, {}),
    uuidAt(101),
    {
      service: {
        async generateChallengeBrief() {
          throw new ChallengeBriefConflictError("Session has no claims to compile into a Challenge Brief.");
        },
      },
    },
  );
  const notFoundPayload = (await notFound.json()) as { error: { code: string; message: string } };
  const conflictPayload = (await conflict.json()) as { error: { code: string; message: string } };

  assert.equal(notFound.status, 404);
  assert.equal(notFoundPayload.error.code, "challenge_brief_not_found");
  assert.match(notFoundPayload.error.message, /Session/);
  assert.equal(conflict.status, 409);
  assert.equal(conflictPayload.error.code, "challenge_brief_conflict");
});

function routeService(calls: string[]): ChallengeBriefRouteService {
  return {
    async generateChallengeBrief(sessionId) {
      calls.push(sessionId);
      return response(sessionId);
    },
  };
}

function response(sessionId: string): ChallengeBriefResponse {
  return {
    status: "created",
    sessionId,
    artifact: {
      id: uuidAt(900),
      kind: "challenge_brief",
      title: "Challenge Brief",
      summary: "Brief summary.",
      createdAt: now(),
      payload: {
        kind: "challenge_brief",
        title: "Challenge Brief",
        sessionId,
        sections: {
          originalSeedIdea: { text: "Seed", sourceId: uuidAt(150) },
          currentPrimaryClaim: { claimId: uuidAt(201), claimVersionId: uuidAt(301), text: "Claim", confidence: 60 },
          keyAssumptions: [],
          selectedPressurePoint: {
            targetClaimId: uuidAt(201),
            targetClaimVersionId: uuidAt(301),
            targetEdgeId: null,
            failureType: null,
            text: "Claim",
          },
          whyPennyChoseIt: ["Compiled from persisted state."],
          challengeIssued: {
            text: "No challenge issued yet.",
            strength: null,
            whatWouldResolveIt: null,
            challengeMoveId: null,
            challengeRoundId: null,
          },
          userResponse: { text: "No response recorded yet.", response: null, reasoning: null, moveId: null },
          whatChanged: [
            {
              text: "No claim text changed; no response recorded yet.",
              previousClaimVersionId: null,
              currentClaimVersionId: null,
              moveId: null,
            },
          ],
          openRisks: [
            {
              kind: "none",
              text: "No unresolved risk.",
              claimId: null,
              edgeId: null,
              reason: "Compiled from persisted rows only.",
            },
          ],
          recommendedNextMove: {
            action: "clarify",
            targetClaimId: uuidAt(201),
            targetEdgeId: null,
            why: "Clarify the primary claim.",
            expectedCompletionMove: "claim_revised|focus_completed",
          },
          moveTimelineSummary: [],
        },
        refs: {
          sourceIds: [uuidAt(150)],
          claimIds: [uuidAt(201)],
          claimVersionIds: [uuidAt(301)],
          edgeIds: [],
          moveIds: [],
          artifactIds: [],
        },
        inputs: {
          focusState: null,
          latestSelectedCandidate: null,
          challengeRoundIds: [],
        },
        generatedFrom: {
          claimCount: 1,
          currentClaimVersionCount: 1,
          moveCount: 0,
          challengeCount: 0,
        },
        generatedBy: {
          brainRunId: uuidAt(800),
          compiler: "challenge-brief-v0",
        },
      },
    },
    move: {
      id: uuidAt(901),
      kind: "artifact_created",
      summary: "Generated a Challenge Brief artifact from persisted Thinking Mode state.",
      claimIds: [uuidAt(201)],
      edgeIds: [],
      artifactIds: [uuidAt(900)],
    },
    brainRun: {
      id: uuidAt(800),
      status: "succeeded",
    },
    brief: {} as ChallengeBriefResponse["brief"],
  };
}

function request(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function now(): string {
  return "2026-04-29T00:00:00.000Z";
}

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}
