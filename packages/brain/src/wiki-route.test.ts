import assert from "node:assert/strict";
import test from "node:test";
import {
  WikiConflictError,
  WikiNotFoundError,
  compileWikiPage,
  handleSessionWikiRequest,
  type WikiCompileState,
  type WikiRouteInput,
} from "./wiki-route.ts";

test("POST /brain/session/:sessionId/wiki validates the path session id before compilation", async () => {
  let compiled = false;
  const response = await handleSessionWikiRequest(request("http://localhost/brain/session/not-a-uuid/wiki", {}), "not-a-uuid", {
    async compileWiki() {
      compiled = true;
      throw new Error("compileWiki should not run");
    },
  });
  const payload = (await response.json()) as { error: { code: string; issues: string[] } };

  assert.equal(response.status, 400);
  assert.equal(payload.error.code, "invalid_session_id");
  assert.match(payload.error.issues.join("\n"), /Invalid UUID/);
  assert.equal(compiled, false);
});

test("POST /brain/session/:sessionId/wiki returns a persisted WikiPage and compilation move", async () => {
  let inputSeen: WikiRouteInput | undefined;
  const sessionId = uuidAt(100);
  const response = await handleSessionWikiRequest(
    request(`http://localhost/brain/session/${sessionId}/wiki`, { title: "Compiled Session Wiki" }),
    sessionId,
    {
      async compileWiki(input) {
        inputSeen = input;

        return {
          wikiPage: {
            id: uuidAt(900),
            sessionId,
            title: input.title ?? "Wiki",
            slug: "compiled-session-wiki",
            summary: "1 claim, 1 edge, 1 move, 1 artifact, 1 source span.",
            content: compileWikiPage(sampleState(sessionId), {
              sessionId,
              title: input.title,
              slug: "compiled-session-wiki",
            }).content,
            createdAt: now().toISOString(),
          },
          move: {
            id: uuidAt(901),
            kind: "wiki_page_compiled",
            summary: "Compiled WikiPage from persisted Brain state.",
            claimIds: [uuidAt(201)],
            edgeIds: [uuidAt(401)],
            artifactIds: [uuidAt(701)],
            wikiPageId: uuidAt(900),
          },
        };
      },
    },
  );
  const payload = (await response.json()) as {
    data: {
      wikiPage: {
        id: string;
        title: string;
        content: {
          editPolicy: string;
          generatedFrom: { claimIds: string[]; claimVersionIds: string[]; edgeIds: string[]; moveIds: string[]; artifactIds: string[]; sourceSpanIds: string[] };
        };
      };
      move: { kind: string; wikiPageId: string };
    };
  };

  assert.equal(response.status, 201);
  assert.equal(inputSeen?.sessionId, sessionId);
  assert.equal(inputSeen?.title, "Compiled Session Wiki");
  assert.equal(payload.data.wikiPage.id, uuidAt(900));
  assert.equal(payload.data.wikiPage.title, "Compiled Session Wiki");
  assert.equal(payload.data.wikiPage.content.editPolicy, "compiled_view_only");
  assert.deepEqual(payload.data.wikiPage.content.generatedFrom.claimIds, [uuidAt(201), uuidAt(202)]);
  assert.deepEqual(payload.data.wikiPage.content.generatedFrom.claimVersionIds, [uuidAt(301), uuidAt(302), uuidAt(303)]);
  assert.deepEqual(payload.data.wikiPage.content.generatedFrom.edgeIds, [uuidAt(401)]);
  assert.deepEqual(payload.data.wikiPage.content.generatedFrom.moveIds, [uuidAt(501)]);
  assert.deepEqual(payload.data.wikiPage.content.generatedFrom.artifactIds, [uuidAt(701)]);
  assert.deepEqual(payload.data.wikiPage.content.generatedFrom.sourceSpanIds, [uuidAt(601), uuidAt(602)]);
  assert.equal(payload.data.move.kind, "wiki_page_compiled");
  assert.equal(payload.data.move.wikiPageId, uuidAt(900));
});

test("wiki compiler builds a view from Brain rows without becoming source of truth", () => {
  const state = sampleState();
  const draft = compileWikiPage(state, { sessionId: state.session.id });
  const headings = draft.content.sections.map((section) => section.heading);
  const currentClaims = draft.content.sections.find((section) => section.heading === "Current Claims")?.items as Array<{
    claimId: string;
    text: string;
    sourceSpanIds: string[];
  }>;

  assert.equal(draft.title, "Wiki: Penny should reduce cognitive load.");
  assert.equal(draft.slug, `session-${state.session.id.slice(0, 8)}-wiki`);
  assert.equal(draft.content.sourceOfTruth, "claims_claim_versions_edges_moves_artifacts_source_spans");
  assert.equal(draft.content.editPolicy, "compiled_view_only");
  assert.deepEqual(headings, ["Current Claims", "Edges", "Move History", "Artifacts", "Source Spans"]);
  assert.equal(currentClaims[1]?.text, "Students will use a guided study flow when material is complex.");
  assert.deepEqual(currentClaims[1]?.sourceSpanIds, [uuidAt(602)]);
  assert.deepEqual(draft.content.generatedFrom.claimIds, [uuidAt(201), uuidAt(202)]);
  assert.deepEqual(draft.content.generatedFrom.claimVersionIds, [uuidAt(301), uuidAt(302), uuidAt(303)]);
  assert.deepEqual(draft.content.generatedFrom.edgeIds, [uuidAt(401)]);
  assert.deepEqual(draft.content.generatedFrom.moveIds, [uuidAt(501)]);
  assert.deepEqual(draft.content.generatedFrom.artifactIds, [uuidAt(701)]);
  assert.deepEqual(draft.content.generatedFrom.sourceSpanIds, [uuidAt(601), uuidAt(602)]);
});

test("wiki route maps not-found and conflict failures to stable errors", async () => {
  const notFound = await handleSessionWikiRequest(validRequest(), uuidAt(100), {
    async compileWiki() {
      throw new WikiNotFoundError("Session was not found.");
    },
  });
  const conflict = await handleSessionWikiRequest(validRequest(), uuidAt(100), {
    async compileWiki() {
      throw new WikiConflictError("Cannot compile a WikiPage for a session without claims.");
    },
  });
  const notFoundPayload = (await notFound.json()) as { error: { code: string } };
  const conflictPayload = (await conflict.json()) as { error: { code: string } };

  assert.equal(notFound.status, 404);
  assert.equal(notFoundPayload.error.code, "wiki_not_found");
  assert.equal(conflict.status, 409);
  assert.equal(conflictPayload.error.code, "wiki_conflict");
});

function sampleState(sessionId = uuidAt(100)): WikiCompileState {
  const seedClaimId = uuidAt(201);
  const assumptionClaimId = uuidAt(202);
  const sourceId = uuidAt(150);

  return {
    session: {
      id: sessionId,
      status: "open",
      title: "Penny should reduce cognitive load.",
      createdAt: now(),
      endedAt: null,
    },
    claims: [
      claim(seedClaimId, sourceId, "belief"),
      claim(assumptionClaimId, sourceId, "assumption"),
    ],
    claimVersions: [
      version(uuidAt(301), seedClaimId, sourceId, "Penny should reduce cognitive load.", 62, true),
      version(uuidAt(302), assumptionClaimId, sourceId, "Students will use guided study flow.", 50, false),
      version(uuidAt(303), assumptionClaimId, sourceId, "Students will use a guided study flow when material is complex.", 54, true),
    ],
    edges: [
      {
        id: uuidAt(401),
        sessionId,
        fromClaimId: seedClaimId,
        toClaimId: assumptionClaimId,
        kind: "depends_on",
        status: "active",
        label: "load-bearing assumption",
        createdAt: now(),
      },
    ],
    moves: [
      {
        id: uuidAt(501),
        sessionId,
        kind: "assumption_refined",
        summary: "Refined an extracted assumption.",
        payload: { claimIds: [assumptionClaimId], edgeIds: [uuidAt(401)] },
        createdAt: now(),
      },
    ],
    artifacts: [
      {
        id: uuidAt(701),
        sessionId,
        kind: "idea_map_challenge_brief",
        title: "Idea Map + Challenge Brief",
        summary: "Compiled a challenge brief.",
        payload: { challengeBrief: { unresolvedRisks: [] } },
        createdAt: now(),
      },
    ],
    sourceSpans: [
      span(uuidAt(601), sourceId, seedClaimId, uuidAt(301)),
      span(uuidAt(602), sourceId, assumptionClaimId, uuidAt(303)),
    ],
  };
}

function claim(
  id: string,
  sourceId: string,
  kind: "belief" | "assumption" | "question" | "concept",
) {
  return {
	    id,
	    sessionId: uuidAt(100),
	    sourceId,
	    kind,
	    createdAt: now(),
	  };
}

function version(
  id: string,
  claimId: string,
  sourceId: string,
  content: string,
  confidence: number,
  isCurrent: boolean,
) {
  return {
	    id,
	    claimId,
	    sourceId,
	    brainRunId: uuidAt(701),
	    moveId: null,
	    content,
    status: "exploratory" as const,
    confidence,
    isCurrent,
    validFrom: now(),
    validUntil: isCurrent ? null : now(),
    supersededByVersionId: null,
    createdAt: now(),
  };
}

function span(id: string, sourceId: string, claimId: string, claimVersionId: string) {
  return {
    id,
    sourceId,
    claimId,
    claimVersionId,
    startOffset: 0,
    endOffset: 12,
    label: "claim_provenance",
    createdAt: now(),
  };
}

function validRequest(): Request {
  return request(`http://localhost/brain/session/${uuidAt(100)}/wiki`, {});
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

function now(): Date {
  return new Date("2026-04-27T00:00:00.000Z");
}

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
