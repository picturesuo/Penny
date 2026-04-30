import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBrainDocuments,
  handleBrainDocumentsRequest,
  type BrainDocumentsPayload,
  type BrainDocumentsState,
} from "./brain-documents-route.ts";

test("buildBrainDocuments creates a document log with rundown sections and a graph preview", () => {
  const sessionId = uuidAt(101);
  const olderSessionId = uuidAt(102);
  const payload = buildBrainDocuments({
    sessions: [
      sessionRow(olderSessionId, "Older doc", "2026-04-28T12:00:00.000Z"),
      sessionRow(sessionId, "Penny founder workflow", "2026-04-29T12:00:00.000Z"),
    ],
    sources: [
      sourceRow(sessionId, "Pre-seed founders will pay for structured thinking."),
      sourceRow(olderSessionId, "Older idea."),
    ],
    claims: [
      claimRow(sessionId, uuidAt(201), "belief"),
      claimRow(sessionId, uuidAt(202), "assumption"),
      claimRow(sessionId, uuidAt(203), "assumption"),
      claimRow(sessionId, uuidAt(204), "belief"),
      claimRow(olderSessionId, uuidAt(205), "belief"),
    ],
    claimVersions: [
      versionRow(uuidAt(301), uuidAt(201), "Founders pay during urgent strategy moments.", 72, "exploratory"),
      versionRow(uuidAt(302), uuidAt(202), "The urgent moment is fundraising or strategy review.", 80, "committed"),
      versionRow(uuidAt(303), uuidAt(203), "Founders will pay before traction without urgency.", 24, "exploratory"),
      versionRow(uuidAt(304), uuidAt(204), "A broad always-on brain subscription wins immediately.", 18, "rejected"),
      versionRow(uuidAt(305), uuidAt(205), "Older idea main claim.", 66, "exploratory"),
    ],
    edges: [edgeRow(sessionId, uuidAt(203), uuidAt(201), "challenges", "active")],
    moves: [
      moveRow(sessionId, uuidAt(401), "challenge_issued", "Issued a challenge.", "2026-04-29T12:20:00.000Z"),
      moveRow(olderSessionId, uuidAt(402), "seed_claim_created", "Created seed.", "2026-04-28T12:05:00.000Z"),
    ],
    artifacts: [
      artifactRow(sessionId, uuidAt(501), "Challenge Brief", "2026-04-29T12:30:00.000Z", {
        sections: {
          recommendedNextMove: {
            action: "verify",
            why: "Interview founders in an urgent fundraising decision.",
          },
        },
      }),
    ],
  });

  assert.equal(payload.sourceOfTruth, "sessions_sources_claims_claim_versions_edges_moves_artifacts");
  assert.equal(payload.documents.length, 2);
  assert.equal(payload.documents[0]?.sessionId, sessionId);
  assert.equal(payload.documents[0]?.originalIdea, "Pre-seed founders will pay for structured thinking.");
  assert.equal(payload.documents[0]?.mainClaim?.text, "Founders pay during urgent strategy moments.");
  assert.deepEqual(
    payload.documents[0]?.strongestOptions.map((claim) => claim.text),
    ["The urgent moment is fundraising or strategy review.", "Founders will pay before traction without urgency."],
  );
  assert.deepEqual(
    payload.documents[0]?.rejectedOptions.map((claim) => claim.text),
    ["A broad always-on brain subscription wins immediately."],
  );
  assert.deepEqual(payload.documents[0]?.finalRecommendations, [
    "Interview founders in an urgent fundraising decision.",
  ]);
  assert.deepEqual(payload.documents[0]?.nextActions, [
    "Verify: Interview founders in an urgent fundraising decision.",
  ]);
  assert.ok(payload.documents[0]?.todoLaterIdeas.some((item) => item.startsWith("Resolve challenge around:")));
  assert.equal(payload.documents[0]?.latestArtifact?.title, "Challenge Brief");
  assert.equal(payload.documents[0]?.lastMove?.kind, "challenge_issued");
  assert.equal(payload.graph.nodes.some((node) => node.id === `document:${sessionId}`), true);
  assert.equal(payload.graph.edges.some((edge) => edge.source === `document:${sessionId}`), true);
  assert.deepEqual(payload.meta, {
    documentCount: 2,
    claimCount: 5,
    edgeCount: 1,
  });
});

test("GET /api/brain/documents delegates to the route loader", async () => {
  const payload = buildBrainDocuments({
    sessions: [sessionRow(uuidAt(101), "Penny founder workflow", "2026-04-29T12:00:00.000Z")],
    sources: [],
    claims: [],
    claimVersions: [],
    edges: [],
    moves: [],
    artifacts: [],
  });
  const calls: string[] = [];
  const response = await handleBrainDocumentsRequest(new Request("http://localhost/api/brain/documents"), {
    async loadDocuments() {
      calls.push("loadDocuments");
      return payload;
    },
  });
  const body = (await response.json()) as { data: BrainDocumentsPayload };

  assert.equal(response.status, 200);
  assert.equal(body.data.documents[0]?.title, "Penny founder workflow");
  assert.deepEqual(calls, ["loadDocuments"]);
});

test("GET /api/brain/documents validates method before loading", async () => {
  const calls: string[] = [];
  const response = await handleBrainDocumentsRequest(
    new Request("http://localhost/api/brain/documents", {
      method: "POST",
    }),
    {
      async loadDocuments() {
        calls.push("loadDocuments");
        return emptyDocuments();
      },
    },
  );
  const body = (await response.json()) as { error: { code: string } };

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET");
  assert.equal(body.error.code, "method_not_allowed");
  assert.deepEqual(calls, []);
});

function emptyDocuments(): BrainDocumentsPayload {
  return buildBrainDocuments({
    sessions: [],
    sources: [],
    claims: [],
    claimVersions: [],
    edges: [],
    moves: [],
    artifacts: [],
  });
}

function sessionRow(id: string, title: string, createdAt: string): BrainDocumentsState["sessions"][number] {
  return {
    id,
    userId: "dev-user",
    workspaceId: "dev-workspace",
    projectId: "dev-project",
    sphereId: "dev-sphere",
    status: "open",
    title,
    createdAt: new Date(createdAt),
    endedAt: null,
  };
}

function sourceRow(sessionId: string, rawText: string): BrainDocumentsState["sources"][number] {
  return {
    id: uuidAt(901),
    userId: "dev-user",
    workspaceId: "dev-workspace",
    projectId: "dev-project",
    sphereId: "dev-sphere",
    sessionId,
    kind: "raw_idea",
    rawText,
    createdAt: new Date("2026-04-29T12:00:00.000Z"),
  };
}

function claimRow(
  sessionId: string,
  id: string,
  kind: BrainDocumentsState["claims"][number]["kind"],
): BrainDocumentsState["claims"][number] {
  return {
    id,
    userId: "dev-user",
    workspaceId: "dev-workspace",
    projectId: "dev-project",
    sphereId: "dev-sphere",
    sessionId,
    sourceId: uuidAt(901),
    kind,
    createdAt: new Date("2026-04-29T12:00:00.000Z"),
  };
}

function versionRow(
  id: string,
  claimId: string,
  content: string,
  confidence: number,
  status: BrainDocumentsState["claimVersions"][number]["status"],
): BrainDocumentsState["claimVersions"][number] {
  return {
    id,
    claimId,
    sourceId: uuidAt(901),
    brainRunId: null,
    moveId: null,
    content,
    status,
    confidence,
    isCurrent: true,
    validFrom: new Date("2026-04-29T12:00:00.000Z"),
    validUntil: null,
    supersededByVersionId: null,
    createdAt: new Date("2026-04-29T12:00:00.000Z"),
  };
}

function edgeRow(
  sessionId: string,
  fromClaimId: string,
  toClaimId: string,
  kind: BrainDocumentsState["edges"][number]["kind"],
  status: BrainDocumentsState["edges"][number]["status"],
): BrainDocumentsState["edges"][number] {
  return {
    id: uuidAt(601),
    userId: "dev-user",
    workspaceId: "dev-workspace",
    projectId: "dev-project",
    sphereId: "dev-sphere",
    sessionId,
    fromClaimId,
    toClaimId,
    kind,
    status,
    label: "shaky_assumption",
    createdAt: new Date("2026-04-29T12:05:00.000Z"),
  };
}

function moveRow(
  sessionId: string,
  id: string,
  kind: BrainDocumentsState["moves"][number]["kind"],
  summary: string,
  createdAt: string,
): BrainDocumentsState["moves"][number] {
  return {
    id,
    userId: "dev-user",
    workspaceId: "dev-workspace",
    projectId: "dev-project",
    sphereId: "dev-sphere",
    sessionId,
    kind,
    summary,
    payload: {},
    createdAt: new Date(createdAt),
  };
}

function artifactRow(
  sessionId: string,
  id: string,
  title: string,
  createdAt: string,
  payload: Record<string, unknown>,
): BrainDocumentsState["artifacts"][number] {
  return {
    id,
    userId: "dev-user",
    workspaceId: "dev-workspace",
    projectId: "dev-project",
    sphereId: "dev-sphere",
    sessionId,
    kind: "challenge_brief",
    title,
    summary: "Current Challenge Brief.",
    payload,
    createdAt: new Date(createdAt),
  };
}

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}
