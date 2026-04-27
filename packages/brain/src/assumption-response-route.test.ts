import assert from "node:assert/strict";
import test from "node:test";
import {
  AssumptionResponseConflictError,
  AssumptionResponseNotFoundError,
  handleAssumptionResponseRequest,
  type AssumptionResponseRequest,
} from "./assumption-response-route.ts";

test("POST /brain/assumptions/:claimId/respond validates claim ids before persistence", async () => {
  let persisted = false;
  const response = await handleAssumptionResponseRequest(
    new Request("http://localhost/brain/assumptions/not-a-uuid/respond", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ action: "confirm" }),
    }),
    "not-a-uuid",
    {
      async persistResponse() {
        persisted = true;
        throw new Error("persistResponse should not run");
      },
    },
  );
  const payload = (await response.json()) as { error: { code: string } };

  assert.equal(response.status, 400);
  assert.equal(payload.error.code, "invalid_claim_id");
  assert.equal(persisted, false);
});

test("POST /brain/assumptions/:claimId/respond validates refine content", async () => {
  let persisted = false;
  const response = await handleAssumptionResponseRequest(
    new Request("http://localhost/brain/assumptions/00000000-0000-4000-8000-000000000101/respond", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ action: "refine", refinedText: "" }),
    }),
    "00000000-0000-4000-8000-000000000101",
    {
      async persistResponse() {
        persisted = true;
        throw new Error("persistResponse should not run");
      },
    },
  );
  const payload = (await response.json()) as { error: { code: string; issues: string[] } };

  assert.equal(response.status, 400);
  assert.equal(payload.error.code, "invalid_request");
  assert.match(payload.error.issues.join("\n"), /refinedText/);
  assert.equal(persisted, false);
});

test("POST /brain/assumptions/:claimId/respond persists confirmation as a move-backed version change", async () => {
  let persisted: { claimId: string; response: AssumptionResponseRequest } | undefined;
  const response = await handleAssumptionResponseRequest(
    new Request("http://localhost/brain/assumptions/00000000-0000-4000-8000-000000000101/respond", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ action: "confirm" }),
    }),
    "00000000-0000-4000-8000-000000000101",
    {
      async persistResponse(claimId, responseBody) {
        persisted = { claimId, response: responseBody };

        return {
          claim: {
            id: claimId,
            versionId: "00000000-0000-4000-8000-000000000202",
            kind: "assumption",
            status: "committed",
            text: "Founders will trust challenge before planning.",
            confidence: 64,
          },
          move: {
            id: "00000000-0000-4000-8000-000000000303",
            kind: "assumption_confirmed",
            summary: "Confirmed an extracted assumption.",
            claimIds: [claimId],
            edgeIds: [],
            artifactIds: [],
          },
          previousVersionId: "00000000-0000-4000-8000-000000000201",
        };
      },
    },
  );
  const payload = (await response.json()) as {
    data: {
      claim: { id: string; status: string; text: string };
      move: { kind: string; claimIds: string[] };
      previousVersionId: string;
    };
  };

  assert.equal(response.status, 200);
  assert.equal(persisted?.claimId, "00000000-0000-4000-8000-000000000101");
  assert.equal(persisted?.response.action, "confirm");
  assert.equal(payload.data.claim.status, "committed");
  assert.equal(payload.data.move.kind, "assumption_confirmed");
  assert.deepEqual(payload.data.move.claimIds, ["00000000-0000-4000-8000-000000000101"]);
});

test("POST /brain/assumptions/:claimId/respond maps persistence failures to stable errors", async () => {
  const notFound = await handleAssumptionResponseRequest(
    requestWithBody({ action: "reject" }),
    "00000000-0000-4000-8000-000000000101",
    {
      async persistResponse() {
        throw new AssumptionResponseNotFoundError("Assumption claim was not found.");
      },
    },
  );
  const conflict = await handleAssumptionResponseRequest(
    requestWithBody({ action: "reject" }),
    "00000000-0000-4000-8000-000000000101",
    {
      async persistResponse() {
        throw new AssumptionResponseConflictError("Only assumption claims can be changed.");
      },
    },
  );
  const notFoundPayload = (await notFound.json()) as { error: { code: string } };
  const conflictPayload = (await conflict.json()) as { error: { code: string } };

  assert.equal(notFound.status, 404);
  assert.equal(notFoundPayload.error.code, "assumption_not_found");
  assert.equal(conflict.status, 409);
  assert.equal(conflictPayload.error.code, "assumption_response_conflict");
});

function requestWithBody(body: unknown): Request {
  return new Request("http://localhost/brain/assumptions/00000000-0000-4000-8000-000000000101/respond", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
