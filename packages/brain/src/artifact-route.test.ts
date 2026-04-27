import assert from "node:assert/strict";
import test from "node:test";
import {
  ArtifactConflictError,
  ArtifactNotFoundError,
  buildArtifactDraft,
  handleArtifactRequest,
  type ArtifactRequest,
  type SessionArtifactState,
} from "./artifact-route.ts";

test("POST /brain/artifact validates the session request before persistence", async () => {
  let created = false;
  const response = await handleArtifactRequest(
    request("http://localhost/brain/artifact", { sessionId: "not-a-uuid" }),
    {
      async createArtifact() {
        created = true;
        throw new Error("createArtifact should not run");
      },
    },
  );
  const payload = (await response.json()) as { error: { code: string; issues: string[] } };

  assert.equal(response.status, 400);
  assert.equal(payload.error.code, "invalid_request");
  assert.match(payload.error.issues.join("\n"), /sessionId/);
  assert.equal(created, false);
});

test("POST /brain/artifact returns the persisted artifact row and artifact_created move", async () => {
  let inputSeen: ArtifactRequest | undefined;
  const sessionId = uuidAt(100);
  const response = await handleArtifactRequest(request("http://localhost/brain/artifact", { sessionId }), {
    async createArtifact(input) {
      inputSeen = input;

      return {
        artifact: {
          id: uuidAt(900),
          kind: "idea_map_challenge_brief",
          title: "Idea Map + Challenge Brief",
          summary: "4 claims, 1 unresolved risks, 1 learned concepts. Next: Respond to the challenge.",
          createdAt: now().toISOString(),
          payload: buildArtifactDraft(sampleState(sessionId)).payload,
        },
        move: {
          id: uuidAt(901),
          kind: "artifact_created",
          summary: "Compiled the Idea Map + Challenge Brief from current session state.",
          claimIds: [uuidAt(201), uuidAt(202), uuidAt(203), uuidAt(204)],
          edgeIds: [uuidAt(401), uuidAt(402), uuidAt(403)],
          artifactIds: [uuidAt(900)],
        },
      };
    },
  });
  const payload = (await response.json()) as {
    data: {
      artifact: { kind: string; payload: { challengeBrief: { recommendedNextMove: string } } };
      move: { kind: string; artifactIds: string[] };
    };
  };

  assert.equal(response.status, 201);
  assert.equal(inputSeen?.sessionId, sessionId);
  assert.equal(payload.data.artifact.kind, "idea_map_challenge_brief");
  assert.match(payload.data.artifact.payload.challengeBrief.recommendedNextMove, /Respond/);
  assert.equal(payload.data.move.kind, "artifact_created");
  assert.deepEqual(payload.data.move.artifactIds, [uuidAt(900)]);
});

test("artifact compiler uses actual session claims, versions, edges, moves, challenges, and learned concepts", () => {
  const draft = buildArtifactDraft(sampleState());
  const payload = draft.payload;
  const refinedAssumption = payload.ideaMap.claims.find((claim) => claim.id === uuidAt(202));

  assert.equal(draft.title, "Idea Map + Challenge Brief");
  assert.equal(payload.generatedFrom.claimCount, 4);
  assert.equal(payload.generatedFrom.claimVersionCount, 5);
  assert.equal(payload.ideaMap.edges.length, 3);
  assert.equal(refinedAssumption?.versions.length, 2);
  assert.equal(refinedAssumption?.text, "Students will use a guided study flow when material is complex.");
  assert.equal(payload.challengeBrief.challenges[0]?.critique, "The flow may hide the actual hard concept instead of clarifying it.");
  assert.equal(payload.challengeBrief.challenges[0]?.strength, "strong");
  assert.equal(payload.learnedConcepts[0]?.term, "cognitive load");
  assert.deepEqual(payload.learnedConcepts[0]?.teachesClaimIds, [uuidAt(202)]);
  assert.match(payload.challengeBrief.unresolvedRisks[0]?.reason ?? "", /Active challenge/);
  assert.ok(payload.challengeBrief.whatChanged.some((change) => change.kind === "assumption_refined"));
  assert.match(payload.challengeBrief.recommendedNextMove, /Defend, Revise, or Absorb/);
  assert.doesNotMatch(draft.summary, /AI can help|generic|as an AI/i);
});

test("artifact compiler requires claims and route maps failures to stable errors", async () => {
  assert.throws(
    () =>
      buildArtifactDraft({
        ...sampleState(),
        claims: [],
        claimVersions: [],
        edges: [],
        moves: [],
      }),
    (error) => {
      assert.ok(error instanceof ArtifactConflictError);
      return true;
    },
  );

  const notFound = await handleArtifactRequest(request("http://localhost/brain/artifact", { sessionId: uuidAt(100) }), {
    async createArtifact() {
      throw new ArtifactNotFoundError("Session was not found.");
    },
  });
  const conflict = await handleArtifactRequest(request("http://localhost/brain/artifact", { sessionId: uuidAt(100) }), {
    async createArtifact() {
      throw new ArtifactConflictError("Cannot compile an artifact for a session without claims.");
    },
  });
  const notFoundPayload = (await notFound.json()) as { error: { code: string } };
  const conflictPayload = (await conflict.json()) as { error: { code: string } };

  assert.equal(notFound.status, 404);
  assert.equal(notFoundPayload.error.code, "artifact_session_not_found");
  assert.equal(conflict.status, 409);
  assert.equal(conflictPayload.error.code, "artifact_conflict");
});

function sampleState(sessionId = uuidAt(100)): SessionArtifactState {
  const sourceId = uuidAt(150);
  const seedClaimId = uuidAt(201);
  const assumptionClaimId = uuidAt(202);
  const critiqueClaimId = uuidAt(203);
  const conceptClaimId = uuidAt(204);
  const dependsOnEdgeId = uuidAt(401);
  const challengeEdgeId = uuidAt(402);
  const teachesEdgeId = uuidAt(403);

  return {
    session: {
      id: sessionId,
      status: "open",
      title: "Penny should reduce cognitive load while students study complex material.",
      createdAt: now(),
      endedAt: null,
    },
    claims: [
      claim(seedClaimId, sessionId, sourceId, "belief", "Penny should reduce cognitive load while students study complex material.", 62),
      claim(assumptionClaimId, sessionId, sourceId, "assumption", "Students will use guided study flow.", 54),
      claim(critiqueClaimId, sessionId, sourceId, "belief", "The flow may hide the actual hard concept instead of clarifying it.", 82),
      claim(conceptClaimId, sessionId, sourceId, "concept", "cognitive load", 70),
    ],
    claimVersions: [
      version(uuidAt(301), seedClaimId, sourceId, "Penny should reduce cognitive load while students study complex material.", 62),
      version(uuidAt(302), assumptionClaimId, sourceId, "Students will use guided study flow.", 50, false),
      version(
        uuidAt(303),
        assumptionClaimId,
        sourceId,
        "Students will use a guided study flow when material is complex.",
        54,
      ),
      version(uuidAt(304), critiqueClaimId, sourceId, "The flow may hide the actual hard concept instead of clarifying it.", 82),
      version(
        uuidAt(305),
        conceptClaimId,
        sourceId,
        "cognitive load: the effort needed to hold and use information while studying.",
        70,
      ),
    ],
    edges: [
      edge(dependsOnEdgeId, sessionId, seedClaimId, assumptionClaimId, "depends_on", "load-bearing assumption"),
      edge(challengeEdgeId, sessionId, critiqueClaimId, assumptionClaimId, "challenges", "shaky_assumption"),
      edge(teachesEdgeId, sessionId, conceptClaimId, assumptionClaimId, "teaches", "cognitive load"),
    ],
    moves: [
      move(uuidAt(501), sessionId, "seed_claim_created", "Created the stable seed claim.", [seedClaimId], []),
      move(
        uuidAt(502),
        sessionId,
        "assumption_refined",
        "Refined an extracted assumption.",
        [assumptionClaimId],
        [dependsOnEdgeId],
      ),
      move(uuidAt(503), sessionId, "challenge_issued", "Issued a first challenge.", [assumptionClaimId, critiqueClaimId], [
        challengeEdgeId,
      ], {
        challengeEdgeId,
        strength: "strong",
      }),
      move(uuidAt(504), sessionId, "learning_triggered", "Saved an inline Learn concept.", [assumptionClaimId, conceptClaimId], [
        teachesEdgeId,
      ]),
    ],
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

function claim(
  id: string,
  sessionId: string,
  sourceId: string,
  kind: "belief" | "assumption" | "question" | "concept",
  text: string,
  confidence: number,
) {
  return {
    id,
    sessionId,
    sourceId,
    kind,
    status: "exploratory" as const,
    text,
    confidence,
    createdAt: now(),
    updatedAt: now(),
  };
}

function version(
  id: string,
  claimId: string,
  sourceId: string,
  content: string,
  confidence: number,
  isCurrent = true,
) {
  return {
    id,
    claimId,
    sourceId,
    content,
    status: "exploratory" as const,
    confidence,
    isCurrent,
    createdAt: now(),
  };
}

function edge(
  id: string,
  sessionId: string,
  fromClaimId: string,
  toClaimId: string,
  kind: "depends_on" | "challenges" | "teaches",
  label: string,
) {
  return {
    id,
    sessionId,
    fromClaimId,
    toClaimId,
    kind,
    status: "active" as const,
    label,
    createdAt: now(),
  };
}

function move(
  id: string,
  sessionId: string,
  kind:
    | "seed_claim_created"
    | "assumption_refined"
    | "challenge_issued"
    | "learning_triggered",
  summary: string,
  claimIds: string[],
  edgeIds: string[],
  extraPayload: Record<string, unknown> = {},
) {
  return {
    id,
    sessionId,
    kind,
    summary,
    payload: {
      claimIds,
      edgeIds,
      ...extraPayload,
    },
    createdAt: now(),
  };
}

function now(): Date {
  return new Date("2026-04-27T00:00:00.000Z");
}

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
