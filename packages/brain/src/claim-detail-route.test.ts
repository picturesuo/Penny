import assert from "node:assert/strict";
import test from "node:test";
import {
  ClaimDetailConflictError,
  ClaimDetailNotFoundError,
  buildClaimDetailFromState,
  handleClaimDetailRequest,
  type ClaimDetailState,
} from "./claim-detail-route.ts";

const sessionId = uuidAt(100);
const sourceId = uuidAt(150);
const seedClaimId = uuidAt(201);
const assumptionClaimId = uuidAt(202);
const critiqueClaimId = uuidAt(203);
const conceptClaimId = uuidAt(204);
const oldVersionId = uuidAt(302);
const currentVersionId = uuidAt(303);
const dependsOnEdgeId = uuidAt(401);
const challengeEdgeId = uuidAt(402);
const teachesEdgeId = uuidAt(403);
const artifactId = uuidAt(701);

test("GET /brain/claims/:claimId/detail validates claim ids before persistence", async () => {
  let loaded = false;
  const response = await handleClaimDetailRequest(getRequest("http://localhost/brain/claims/not-a-uuid/detail"), "not-a-uuid", {
    async loadClaimDetail() {
      loaded = true;
      throw new Error("loadClaimDetail should not run");
    },
  });
  const payload = (await response.json()) as { error: { code: string } };

  assert.equal(response.status, 400);
  assert.equal(payload.error.code, "invalid_claim_id");
  assert.equal(loaded, false);
});

test("GET /brain/claims/:claimId/detail returns old selves, move history, provenance, and attached graph slices", async () => {
  const detail = buildClaimDetailFromState(sampleState());
  let seenClaimId: string | undefined;
  const response = await handleClaimDetailRequest(
    getRequest(`http://localhost/brain/claims/${assumptionClaimId}/detail`),
    assumptionClaimId,
    {
      async loadClaimDetail(claimId) {
        seenClaimId = claimId;
        return detail;
      },
    },
  );
  const payload = (await response.json()) as {
    data: typeof detail;
  };

  assert.equal(response.status, 200);
  assert.equal(seenClaimId, assumptionClaimId);
  assert.equal(payload.data.claim.id, assumptionClaimId);
  assert.equal(payload.data.currentVersion.id, currentVersionId);
  assert.equal(payload.data.currentVersion.content, "Students will use a guided study flow when material is complex.");
  assert.equal(payload.data.oldVersions.length, 1);
  assert.equal(payload.data.oldVersions[0]?.id, oldVersionId);
  assert.equal(payload.data.oldVersions[0]?.state, "old");
  assert.equal(payload.data.currentVersion.validUntil, null);
  assert.equal(payload.data.oldVersions[0]?.validUntil, "2026-04-27T00:00:03.000Z");
  assert.equal(payload.data.oldVersions[0]?.supersededByVersionId, currentVersionId);
  assert.deepEqual(
    payload.data.confidenceHistory.map((entry) => [entry.versionId, entry.confidence, entry.state, entry.validUntil]),
    [
      [oldVersionId, 45, "old", "2026-04-27T00:00:03.000Z"],
      [currentVersionId, 60, "current", null],
    ],
  );
  assert.deepEqual(
    payload.data.moves.map((move) => move.kind),
    [
      "assumption_refined",
      "challenge_issued",
      "user_defended",
      "claim_revised",
      "critique_absorbed",
      "learning_triggered",
    ],
  );
  assert.equal((payload.data.moves.find((move) => move.kind === "user_defended")?.payload as { reasoning: string }).reasoning, "Pilot users did choose guided prompts.");
  assert.equal(payload.data.provenance.source?.id, sourceId);
  assert.equal(payload.data.provenance.spans[0]?.text, "Penny");
  assert.ok(payload.data.connectedClaims.some((connection) => connection.edge.kind === "depends_on"));
  assert.equal(payload.data.activeChallenges[0]?.edge.status, "acknowledged_vulnerability");
  assert.equal(payload.data.activeChallenges[0]?.responseState, "critique_absorbed");
  assert.equal(payload.data.activeChallenges[0]?.critiqueClaim?.id, critiqueClaimId);
  assert.equal(payload.data.learnedConcepts[0]?.conceptClaim.id, conceptClaimId);
  assert.equal(payload.data.learnedConcepts[0]?.edge.id, teachesEdgeId);
  assert.equal(payload.data.artifactReferences[0]?.id, artifactId);
  assert.deepEqual(payload.data.artifactReferences[0]?.referenceReasons, ["claim", "claim_version", "edge"]);
});

test("claim detail route maps not-found and conflict failures to stable errors", async () => {
  const notFound = await handleClaimDetailRequest(
    getRequest(`http://localhost/brain/claims/${assumptionClaimId}/detail`),
    assumptionClaimId,
    {
      async loadClaimDetail() {
        throw new ClaimDetailNotFoundError("Claim was not found.");
      },
    },
  );
  const conflict = await handleClaimDetailRequest(
    getRequest(`http://localhost/brain/claims/${assumptionClaimId}/detail`),
    assumptionClaimId,
    {
      async loadClaimDetail() {
        throw new ClaimDetailConflictError("Claim has no current ClaimVersion.");
      },
    },
  );
  const notFoundPayload = (await notFound.json()) as { error: { code: string } };
  const conflictPayload = (await conflict.json()) as { error: { code: string } };

  assert.equal(notFound.status, 404);
  assert.equal(notFoundPayload.error.code, "claim_not_found");
  assert.equal(conflict.status, 409);
  assert.equal(conflictPayload.error.code, "claim_detail_conflict");
});

function sampleState(): ClaimDetailState {
  return {
    claim: claim(
      assumptionClaimId,
      "assumption",
      "Students will use a guided study flow when material is complex.",
      60,
      2,
    ),
    versions: [
      version(oldVersionId, assumptionClaimId, "Students will use guided study flow.", 45, false, 2),
      version(currentVersionId, assumptionClaimId, "Students will use a guided study flow when material is complex.", 60, true, 3),
    ],
    edges: [
      edge(dependsOnEdgeId, seedClaimId, assumptionClaimId, "depends_on", "load-bearing assumption", "active", 4),
      edge(challengeEdgeId, critiqueClaimId, assumptionClaimId, "challenges", "shaky_assumption", "acknowledged_vulnerability", 5),
      edge(teachesEdgeId, conceptClaimId, assumptionClaimId, "teaches", "cognitive load", "active", 8),
    ],
    connectedClaims: [
      claim(seedClaimId, "belief", "Penny should reduce cognitive load while students study complex material.", 62, 1),
      claim(critiqueClaimId, "belief", "The flow may hide the actual hard concept instead of clarifying it.", 82, 5),
      claim(conceptClaimId, "concept", "cognitive load", 70, 8),
    ],
    connectedVersions: [
      version(uuidAt(301), seedClaimId, "Penny should reduce cognitive load while students study complex material.", 62, true, 1),
      version(uuidAt(304), critiqueClaimId, "The flow may hide the actual hard concept instead of clarifying it.", 82, true, 5),
      version(uuidAt(305), conceptClaimId, "cognitive load: mental effort used to hold and apply information.", 70, true, 8),
    ],
    moves: [
      move(uuidAt(501), "assumption_refined", "Refined an extracted assumption.", 3, {
        claimId: assumptionClaimId,
        previousVersionId: oldVersionId,
        currentVersionId,
      }),
      move(uuidAt(502), "challenge_issued", "Issued a first challenge against the target claim.", 5, {
        claimIds: [assumptionClaimId, critiqueClaimId],
        edgeIds: [challengeEdgeId],
        challengeEdgeId,
        strength: "strong",
      }),
      move(uuidAt(503), "user_defended", "User defended the target claim against the critique.", 6, {
        claimIds: [assumptionClaimId, critiqueClaimId],
        edgeIds: [challengeEdgeId],
        reasoning: "Pilot users did choose guided prompts.",
      }),
      move(uuidAt(504), "claim_revised", "User revised the target claim in response to the critique.", 7, {
        claimIds: [assumptionClaimId, critiqueClaimId],
        edgeIds: [challengeEdgeId],
        reasoning: "Narrowed the claim to complex material.",
        previousClaimVersionId: oldVersionId,
        currentClaimVersionId: currentVersionId,
      }),
      move(uuidAt(505), "critique_absorbed", "User absorbed the critique as an acknowledged vulnerability.", 8, {
        claimIds: [assumptionClaimId, critiqueClaimId],
        edgeIds: [challengeEdgeId],
        reasoning: "The critique still marks a risk.",
      }),
      move(uuidAt(506), "learning_triggered", "Saved an inline Learn concept inside Brain.", 9, {
        claimIds: [assumptionClaimId, conceptClaimId],
        edgeIds: [teachesEdgeId],
        term: "cognitive load",
      }),
      move(uuidAt(507), "seed_claim_created", "Unrelated seed move.", 1, {
        claimIds: [seedClaimId],
        edgeIds: [],
      }),
    ],
    sources: [
      {
        id: sourceId,
        sessionId,
        kind: "raw_idea",
        rawText: "Penny should reduce cognitive load while students study complex material.",
        createdAt: dateAt(1),
      },
    ],
    sourceSpans: [
      {
        id: uuidAt(601),
        sourceId,
        claimId: assumptionClaimId,
        claimVersionId: currentVersionId,
        startOffset: 0,
        endOffset: 5,
        label: "submitted_text",
        createdAt: dateAt(3),
      },
    ],
    artifacts: [
      {
        id: artifactId,
        sessionId,
        kind: "idea_map_challenge_brief",
        title: "Idea Map + Challenge Brief",
        summary: "Compiled brief for the current session.",
        payload: {
          generatedBy: {
            claimIds: [assumptionClaimId],
            claimVersionIds: [currentVersionId],
            edgeIds: [challengeEdgeId],
          },
        },
        createdAt: dateAt(10),
      },
    ],
  };
}

function getRequest(url: string): Request {
  return new Request(url, { method: "GET" });
}

function claim(
  id: string,
  kind: ClaimDetailState["claim"]["kind"],
  text: string,
  confidence: number,
  createdAt: number,
): ClaimDetailState["claim"] {
  return {
    id,
	    sessionId,
	    sourceId,
	    kind,
	    createdAt: dateAt(createdAt),
	  };
}

function version(
  id: string,
  claimId: string,
  content: string,
  confidence: number,
  isCurrent: boolean,
  createdAt: number,
): ClaimDetailState["versions"][number] {
  return {
	    id,
	    claimId,
	    sourceId,
	    brainRunId: uuidAt(701),
	    moveId: null,
	    content,
    status: "exploratory",
    confidence,
    isCurrent,
    validFrom: dateAt(createdAt),
    validUntil: isCurrent ? null : dateAt(createdAt + 1),
    supersededByVersionId: isCurrent ? null : currentVersionId,
    createdAt: dateAt(createdAt),
  };
}

function edge(
  id: string,
  fromClaimId: string,
  toClaimId: string,
  kind: ClaimDetailState["edges"][number]["kind"],
  label: string,
  status: ClaimDetailState["edges"][number]["status"],
  createdAt: number,
): ClaimDetailState["edges"][number] {
  return {
    id,
    sessionId,
    fromClaimId,
    toClaimId,
    kind,
    status,
    label,
    createdAt: dateAt(createdAt),
  };
}

function move(
  id: string,
  kind: ClaimDetailState["moves"][number]["kind"],
  summary: string,
  createdAt: number,
  payload: Record<string, unknown>,
): ClaimDetailState["moves"][number] {
  return {
    id,
    sessionId,
    kind,
    summary,
    payload,
    createdAt: dateAt(createdAt),
  };
}

function dateAt(value: number): Date {
  return new Date(`2026-04-27T00:00:${String(value).padStart(2, "0")}.000Z`);
}

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
