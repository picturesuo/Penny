import assert from "node:assert/strict";
import test from "node:test";
import {
  ArtifactConflictError,
  ArtifactGenerationError,
  ArtifactNotFoundError,
  buildCompiledArtifactPayload,
  createHeuristicArtifactProvider,
  generateArtifactOutput,
  handleArtifactRequest,
  handleSessionArtifactRequest,
  inferShapesFromMoves,
  parseArtifactOutput,
  type ArtifactOutput,
  type ArtifactRequest,
  type SessionArtifactContext,
} from "./artifact-route.ts";

test("POST /brain/artifact validates the session request before compilation", async () => {
  let compiled = false;
  const response = await handleArtifactRequest(
    request("http://localhost/brain/artifact", { sessionId: "not-a-uuid" }),
    {
      async compileArtifact() {
        compiled = true;
        throw new Error("compileArtifact should not run");
      },
    },
  );
  const payload = (await response.json()) as { error: { code: string; issues: string[] } };

  assert.equal(response.status, 400);
  assert.equal(payload.error.code, "invalid_request");
  assert.match(payload.error.issues.join("\n"), /sessionId/);
  assert.equal(compiled, false);
});

test("POST /brain/artifact returns the persisted artifact row and artifact_created move", async () => {
  let inputSeen: ArtifactRequest | undefined;
  const sessionId = uuidAt(100);
  const context = sampleContext(sessionId);
  const output = await generateArtifactOutput({ ...context, requestedKind: "challenge_brief" }, {
    provider: createHeuristicArtifactProvider(),
  });
  const response = await handleArtifactRequest(request("http://localhost/brain/artifact", { sessionId }), {
    async compileArtifact(input) {
      inputSeen = input;

      return {
        artifact: {
          id: uuidAt(900),
          kind: "idea_map_challenge_brief",
          title: "Idea Map + Challenge Brief",
          summary: output.summary,
          createdAt: now(),
          payload: buildCompiledArtifactPayload(context, output, uuidAt(800)),
        },
        move: {
          id: uuidAt(901),
          kind: "artifact_created",
          summary: "Generated a Challenge Brief artifact from persisted Brain state.",
          claimIds: [uuidAt(201), uuidAt(202), uuidAt(203), uuidAt(204)],
          edgeIds: [uuidAt(401), uuidAt(402), uuidAt(403)],
          artifactIds: [uuidAt(900)],
        },
        brainRun: {
          id: uuidAt(800),
          status: "succeeded",
        },
      };
    },
  });
  const payload = (await response.json()) as {
    data: {
      artifact: {
        kind: string;
        payload: {
          ideaMap: { claims: unknown[]; claimVersions: unknown[]; edges: unknown[] };
          challengeBrief: { unresolvedRisks: unknown[]; whatChanged: unknown[]; recommendedNextMove: string };
          learnedConcepts: unknown[];
          shapes: unknown[];
        };
      };
      move: { kind: string; artifactIds: string[] };
    };
  };

  assert.equal(response.status, 201);
  assert.equal(inputSeen?.sessionId, sessionId);
  assert.equal(payload.data.artifact.kind, "idea_map_challenge_brief");
  assert.equal(payload.data.artifact.payload.ideaMap.claims.length, 4);
  assert.equal(payload.data.artifact.payload.ideaMap.claimVersions.length, 5);
  assert.equal(payload.data.artifact.payload.challengeBrief.unresolvedRisks.length, 1);
  assert.match(payload.data.artifact.payload.challengeBrief.recommendedNextMove, /Defend, Revise, or Absorb/);
  assert.equal(payload.data.artifact.payload.challengeBrief.whatChanged.length, 4);
  assert.equal(payload.data.artifact.payload.learnedConcepts.length, 1);
  assert.equal(payload.data.artifact.payload.shapes.length, 3);
  assert.equal(payload.data.move.kind, "artifact_created");
  assert.deepEqual(payload.data.move.artifactIds, [uuidAt(900)]);
});

test("POST /brain/session/:sessionId/artifact uses the path session id", async () => {
  let inputSeen: { sessionId: string; kind: string } | undefined;
  const sessionId = uuidAt(100);
  const context = sampleContext(sessionId);
  const output = await generateArtifactOutput({ ...context, requestedKind: "challenge_brief" }, {
    provider: createHeuristicArtifactProvider(),
  });
  const response = await handleSessionArtifactRequest(
    request(`http://localhost/brain/session/${sessionId}/artifact`, { kind: "challenge_brief" }),
    sessionId,
    {
      async compileArtifact(input) {
        inputSeen = input;

        return {
          artifact: {
            id: uuidAt(900),
            kind: "idea_map_challenge_brief",
            title: "Idea Map + Challenge Brief",
            summary: output.summary,
            createdAt: now(),
            payload: buildCompiledArtifactPayload(context, output, uuidAt(800)),
          },
          move: {
            id: uuidAt(901),
            kind: "artifact_created",
            summary: "Generated a Challenge Brief artifact from persisted Brain state.",
            claimIds: [uuidAt(201), uuidAt(202), uuidAt(203), uuidAt(204)],
            edgeIds: [uuidAt(401), uuidAt(402), uuidAt(403)],
            artifactIds: [uuidAt(900)],
          },
          brainRun: {
            id: uuidAt(800),
            status: "succeeded",
          },
        };
      },
    },
  );
  const payload = (await response.json()) as {
    data: {
      artifact: { kind: string };
      brainRun: { status: string };
    };
  };

  assert.equal(response.status, 201);
  assert.equal(inputSeen?.sessionId, sessionId);
  assert.equal(inputSeen?.kind, "challenge_brief");
  assert.equal(payload.data.artifact.kind, "idea_map_challenge_brief");
  assert.equal(payload.data.brainRun.status, "succeeded");
});

test("artifact compiler output is grounded in session state and rejects generic prose", async () => {
  const context = sampleContext();
  const output = await generateArtifactOutput({ ...context, requestedKind: "challenge_brief" }, {
    provider: createHeuristicArtifactProvider(),
  });
  const payload = buildCompiledArtifactPayload(context, output, uuidAt(800));

  assert.equal(output.challengeBrief.targetClaimId, uuidAt(202));
  assert.equal(payload.ideaMap.claimVersions.length, 5);
  assert.equal(payload.challengeBrief.challenges[0]?.critique, "The flow may hide the actual hard concept instead of clarifying it.");
  assert.equal(payload.learnedConcepts[0]?.term, "cognitive load");
  assert.deepEqual(payload.learnedConcepts[0]?.teachesClaimIds, [uuidAt(202)]);
  assert.ok(payload.challengeBrief.whatChanged.some((change) => change.kind === "assumption_refined"));
  assert.match(payload.challengeBrief.unresolvedRisks[0]?.reason ?? "", /Active challenge/);
  assert.deepEqual(
    payload.shapes.map((shape) => shape.status),
    ["tentative", "tentative", "tentative"],
  );
  assert.ok(payload.shapes.some((shape) => shape.label === "Assumption review loop"));
  assert.ok(payload.shapes.some((shape) => shape.supportingMoveIds.includes("00000000-0000-4000-8000-000000000502")));
  assert.doesNotMatch(output.summary, /AI can help|generic|as an AI/i);

  assert.throws(
    () =>
      parseArtifactOutput(
        {
          ...output,
          summary: "As an AI, I cannot determine enough from this generic response.",
        },
        context,
      ),
    (error) => {
      assert.ok(error instanceof ArtifactGenerationError);
      return true;
    },
  );
});

test("artifact route maps not-found and conflict failures to stable errors", async () => {
  const notFound = await handleArtifactRequest(request("http://localhost/brain/artifact", { sessionId: uuidAt(100) }), {
    async compileArtifact() {
      throw new ArtifactNotFoundError("Session was not found.");
    },
  });
  const conflict = await handleArtifactRequest(request("http://localhost/brain/artifact", { sessionId: uuidAt(100) }), {
    async compileArtifact() {
      throw new ArtifactConflictError("Session has no claims to compile into an artifact.");
    },
  });
  const notFoundPayload = (await notFound.json()) as { error: { code: string } };
  const conflictPayload = (await conflict.json()) as { error: { code: string } };

  assert.equal(notFound.status, 404);
  assert.equal(notFoundPayload.error.code, "artifact_not_found");
  assert.equal(conflict.status, 409);
  assert.equal(conflictPayload.error.code, "artifact_conflict");
});

test("shape inference derives tentative patterns from recent moves only", () => {
  const olderMove = shapeMove(uuidAt(501), "assumption_refined");
  const recentMoves = [
    shapeMove(uuidAt(502), "seed_claim_created"),
    shapeMove(uuidAt(503), "assumptions_extracted"),
    shapeMove(uuidAt(504), "first_challenge_suggested"),
    shapeMove(uuidAt(505), "challenge_issued"),
    shapeMove(uuidAt(506), "claim_revised"),
    shapeMove(uuidAt(507), "verify_run"),
    shapeMove(uuidAt(508), "verify_run"),
    shapeMove(uuidAt(509), "verify_run"),
    shapeMove(uuidAt(510), "source.recorded"),
    shapeMove(uuidAt(511), "source.recorded"),
    shapeMove(uuidAt(512), "source.recorded"),
    shapeMove(uuidAt(513), "source.recorded"),
  ];
  const shapes = inferShapesFromMoves([olderMove, ...recentMoves]);

  assert.deepEqual(
    shapes.map((shape) => shape.status),
    ["tentative", "tentative", "tentative"],
  );
  assert.ok(shapes.every((shape) => shape.confidence >= 0 && shape.confidence <= 88));
  assert.ok(shapes.some((shape) => shape.label === "Challenge response loop"));
  assert.ok(shapes.some((shape) => shape.label === "Evidence checking"));
  assert.ok(shapes.every((shape) => !shape.supportingMoveIds.includes(olderMove.moveId)));
});

function sampleContext(sessionId = uuidAt(100)): SessionArtifactContext {
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
    },
    sources: [
      {
        id: sourceId,
        kind: "raw_idea",
        rawText: "Penny should reduce cognitive load while students study complex material.",
        createdAt: now(),
      },
    ],
    claims: [
      claim(seedClaimId, uuidAt(301), "belief", "Penny should reduce cognitive load while students study complex material.", 62),
      claim(assumptionClaimId, uuidAt(303), "assumption", "Students will use a guided study flow when material is complex.", 54),
      claim(critiqueClaimId, uuidAt(304), "belief", "The flow may hide the actual hard concept instead of clarifying it.", 82),
      claim(conceptClaimId, uuidAt(305), "concept", "cognitive load", 70),
    ],
    claimVersions: [
      version(uuidAt(301), seedClaimId, "Penny should reduce cognitive load while students study complex material.", 62),
      version(uuidAt(302), assumptionClaimId, "Students will use guided study flow.", 50, false),
      version(uuidAt(303), assumptionClaimId, "Students will use a guided study flow when material is complex.", 54),
      version(uuidAt(304), critiqueClaimId, "The flow may hide the actual hard concept instead of clarifying it.", 82),
      version(uuidAt(305), conceptClaimId, "cognitive load: the effort needed to hold and use information while studying.", 70),
    ],
    edges: [
      edge(dependsOnEdgeId, seedClaimId, assumptionClaimId, "depends_on", "load-bearing assumption"),
      edge(challengeEdgeId, critiqueClaimId, assumptionClaimId, "challenges", "shaky_assumption"),
      edge(teachesEdgeId, conceptClaimId, assumptionClaimId, "teaches", "cognitive load"),
    ],
    moves: [
      move(uuidAt(501), "seed_claim_created", "Created the stable seed claim.", [seedClaimId], []),
      move("00000000-0000-4000-8000-000000000502", "assumption_refined", "Refined an extracted assumption.", [
        assumptionClaimId,
      ], [dependsOnEdgeId]),
      move(uuidAt(503), "challenge_issued", "Issued a first challenge.", [assumptionClaimId, critiqueClaimId], [
        challengeEdgeId,
      ], {
        challengeEdgeId,
        strength: "strong",
      }),
      move(uuidAt(504), "learning_triggered", "Saved an inline Learn concept.", [assumptionClaimId, conceptClaimId], [
        teachesEdgeId,
      ]),
    ],
    artifacts: [],
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
  versionId: string,
  kind: "belief" | "assumption" | "question" | "concept",
  text: string,
  confidence: number,
) {
  return {
    id,
    versionId,
    kind,
    status: "exploratory" as const,
    text,
    confidence,
    sourceId: uuidAt(150),
    createdAt: now(),
    updatedAt: now(),
  };
}

function version(id: string, claimId: string, content: string, confidence: number, isCurrent = true) {
  return {
    id,
    claimId,
    sourceId: uuidAt(150),
    content,
    status: "exploratory" as const,
    confidence,
    isCurrent,
    createdAt: now(),
  };
}

function edge(id: string, fromClaimId: string, toClaimId: string, kind: string, label: string) {
  return {
    id,
    fromClaimId,
    toClaimId,
    kind,
    status: "active",
    label,
    createdAt: now(),
  };
}

function move(
  id: string,
  kind: string,
  summary: string,
  claimIds: string[],
  edgeIds: string[],
  extraPayload: Record<string, unknown> = {},
) {
  return {
    id,
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

function shapeMove(id: string, kind: string) {
  return {
    moveId: id,
    kind,
    summary: `Recorded ${kind}.`,
    createdAt: now(),
  };
}

function now(): string {
  return "2026-04-27T00:00:00.000Z";
}

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
