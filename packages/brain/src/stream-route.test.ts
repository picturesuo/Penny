import assert from "node:assert/strict";
import test from "node:test";
import { buildBrainStream, handleBrainStreamRequest, type BrainStream, type StreamState } from "./stream-route.ts";

test("GET /brain/stream returns the injected stream payload", async () => {
  let loaded = false;
  const stream = buildBrainStream(sampleState());
  const response = await handleBrainStreamRequest(request("http://localhost/brain/stream"), {
    async loadStream() {
      loaded = true;
      return stream;
    },
  });
  const payload = (await response.json()) as { data: BrainStream };

  assert.equal(response.status, 200);
  assert.equal(loaded, true);
  assert.equal(payload.data.activeSessions.length, 1);
  assert.equal(payload.data.openChallenges.length, 1);
  assert.equal(payload.data.suggestedNextMoves[0]?.kind, "respond_to_challenge");
});

test("GET /brain/stream rejects non-GET methods", async () => {
  let loaded = false;
  const response = await handleBrainStreamRequest(
    new Request("http://localhost/brain/stream", {
      method: "POST",
    }),
    {
      async loadStream() {
        loaded = true;
        return buildBrainStream(emptyState());
      },
    },
  );
  const payload = (await response.json()) as { error: { code: string } };

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET");
  assert.equal(payload.error.code, "method_not_allowed");
  assert.equal(loaded, false);
});

test("stream suggests starting a session when there are no active sessions", () => {
  const stream = buildBrainStream(emptyState());

  assert.deepEqual(stream.activeSessions, []);
  assert.deepEqual(stream.openChallenges, []);
  assert.equal(stream.suggestedNextMoves.length, 1);
  assert.equal(stream.suggestedNextMoves[0]?.kind, "start_session");
});

test("stream derives open challenges, risks, attention claims, and recent moves", () => {
  const stream = buildBrainStream(sampleState());

  assert.equal(stream.activeSessions[0]?.claimCount, 3);
  assert.equal(stream.activeSessions[0]?.openChallengeCount, 1);
  assert.equal(stream.openChallenges.length, 1);
  assert.equal(stream.openChallenges[0]?.targetClaim?.id, uuidAt(202));
  assert.equal(stream.openChallenges[0]?.critiqueClaim?.id, uuidAt(203));
  assert.ok(stream.unresolvedRisks.some((risk) => risk.kind === "open_challenge" && risk.edgeId === uuidAt(402)));
  assert.ok(stream.unresolvedRisks.some((risk) => risk.kind === "unreviewed_assumption" && risk.claimId === uuidAt(202)));
  assert.ok(stream.unresolvedRisks.some((risk) => risk.kind === "artifact_risk" && risk.claimId === uuidAt(202)));
  assert.ok(stream.claimsNeedingAttention.some((entry) => entry.claim.id === uuidAt(202) && /Open challenge/.test(entry.reason)));
  assert.equal(stream.recentMoves[0]?.id, uuidAt(504));
  assert.deepEqual(
    stream.suggestedNextMoves.map((move) => move.kind),
    ["respond_to_challenge", "review_assumption"],
  );
});

function emptyState(): StreamState {
  return {
    activeSessions: [],
    claims: [],
    claimVersions: [],
    edges: [],
    moves: [],
    artifacts: [],
    recentMoves: [],
  };
}

function sampleState(): StreamState {
  const sessionId = uuidAt(100);
  const seedClaimId = uuidAt(201);
  const assumptionClaimId = uuidAt(202);
  const critiqueClaimId = uuidAt(203);
  const challengeEdgeId = uuidAt(402);

  return {
    activeSessions: [
      {
        id: sessionId,
        status: "open",
        title: "Penny should reduce cognitive load.",
        createdAt: at(1),
        endedAt: null,
      },
    ],
    claims: [
      claim(seedClaimId, sessionId, "belief", "Penny should reduce cognitive load.", 62),
      claim(assumptionClaimId, sessionId, "assumption", "Students will use guided study flow.", 48),
      claim(critiqueClaimId, sessionId, "belief", "The flow may hide the hard concept.", 74),
    ],
    claimVersions: [
      version(uuidAt(301), seedClaimId, "Penny should reduce cognitive load.", 62),
      version(uuidAt(302), assumptionClaimId, "Students will use a guided study flow when material is complex.", 48),
      version(uuidAt(303), critiqueClaimId, "The flow may hide the hard concept.", 74),
    ],
    edges: [
      edge(uuidAt(401), sessionId, seedClaimId, assumptionClaimId, "depends_on", "load-bearing assumption", "active"),
      edge(challengeEdgeId, sessionId, critiqueClaimId, assumptionClaimId, "challenges", "shaky_assumption", "active"),
    ],
    moves: [
      move(uuidAt(501), sessionId, "seed_claim_created", "Created the seed claim.", [seedClaimId], []),
      move(uuidAt(502), sessionId, "assumptions_extracted", "Extracted assumptions.", [seedClaimId, assumptionClaimId], [uuidAt(401)]),
      move(uuidAt(503), sessionId, "challenge_issued", "Issued a challenge.", [assumptionClaimId, critiqueClaimId], [
        challengeEdgeId,
      ]),
      move(uuidAt(504), sessionId, "verify_run", "Checked a claim.", [assumptionClaimId], []),
    ],
    artifacts: [
      {
        id: uuidAt(701),
        sessionId,
        kind: "idea_map_challenge_brief",
        title: "Idea Map + Challenge Brief",
        summary: "Compiled challenge brief.",
        payload: {
          challengeBrief: {
            unresolvedRisks: [
              {
                claimId: assumptionClaimId,
                edgeId: challengeEdgeId,
                text: "Challenge remains unresolved.",
                reason: "Artifact marked it as unresolved.",
                status: "active",
              },
            ],
          },
        },
        createdAt: at(5),
      },
    ],
    recentMoves: [
      move(uuidAt(504), sessionId, "verify_run", "Checked a claim.", [assumptionClaimId], []),
      move(uuidAt(503), sessionId, "challenge_issued", "Issued a challenge.", [assumptionClaimId, critiqueClaimId], [
        challengeEdgeId,
      ]),
    ],
  };
}

function claim(
  id: string,
  sessionId: string,
  kind: "belief" | "assumption" | "question" | "concept",
  text: string,
  confidence: number,
) {
  return {
	    id,
	    sessionId,
	    sourceId: null,
	    kind,
	    createdAt: at(2),
	  };
}

function version(id: string, claimId: string, content: string, confidence: number) {
  return {
	    id,
	    claimId,
	    sourceId: null,
	    brainRunId: uuidAt(701),
	    moveId: null,
	    content,
    status: "exploratory" as const,
    confidence,
    isCurrent: true,
    validFrom: at(3),
    validUntil: null,
    supersededByVersionId: null,
    createdAt: at(3),
  };
}

function edge(
  id: string,
  sessionId: string,
  fromClaimId: string,
  toClaimId: string,
  kind: "depends_on" | "challenges",
  label: string,
  status: "active" | "acknowledged_vulnerability",
) {
  return {
    id,
    sessionId,
    fromClaimId,
    toClaimId,
    kind,
    status,
    label,
    createdAt: at(4),
  };
}

function move(id: string, sessionId: string, kind: StreamState["moves"][number]["kind"], summary: string, claimIds: string[], edgeIds: string[]) {
  return {
    id,
    sessionId,
    kind,
    summary,
    payload: {
      claimIds,
      edgeIds,
    },
    createdAt: at(Number(id.slice(-1)) || 1),
  };
}

function request(url: string): Request {
  return new Request(url, {
    method: "GET",
  });
}

function at(offset: number): Date {
  return new Date(`2026-04-27T00:00:0${offset}.000Z`);
}

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
