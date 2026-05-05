import assert from "node:assert/strict";
import test from "node:test";
import {
  createDemoCheckCycleProvider,
  createInMemoryCheckRouteService,
  handleCheckCycleCommitRequest,
  handleCheckCycleRequest,
  handleCheckCycleSprintRequest,
  handleCheckNodeRequest,
  handleCheckSaveToBrainRequest,
  handleCheckSessionCollectionRequest,
  handleCheckSessionRequest,
  type CheckSession,
} from "./check-route.ts";

test("POST /api/check/session creates a structured Check project and exactly one active cycle", async () => {
  const service = createTestCheckRouteService();
  const response = await handleCheckSessionCollectionRequest(
    jsonRequest("http://localhost/api/check/session", {
      rawText:
        "Penny should help founders turn messy product ideas into stronger arguments before they pitch investors. The weak part is proving that people will use it for real decisions, not just brainstorming.",
    }),
    { service },
  );
  const payload = await responsePayload(response);
  const session = payload.data.session as CheckSession;

  assert.equal(response.status, 201);
  assert.equal(session.sourceOfTruth, "check_projects_cycles_nodes_breakthroughs");
  assert.match(session.project.northStar, /clear enough/i);
  assert.equal(session.project.audienceOrJudge, "Investors");
  assert.deepEqual(
    session.project.nodes.map((node) => node.kind).sort(),
    [
      "assumption",
      "claim",
      "claim",
      "counterargument",
      "decision",
      "evidence",
      "example",
      "experiment",
      "question",
      "task",
      "tension",
      "wild_idea",
    ].sort(),
  );
  assert.equal(session.cycles.length, 1);
  assert.equal(session.cycles[0]?.status, "active");
  assert.equal(session.cycles[0]?.recommendations.length, 5);
  assert.equal(session.cycles[0]?.curveball.slot, "curveball");
  assert.deepEqual(
    session.cycles[0]?.recommendations.map((recommendation) => recommendation.slot),
    ["clarify", "strengthen", "challenge", "reframe", "advance"],
  );

  for (const recommendation of [...(session.cycles[0]?.recommendations ?? []), session.cycles[0]?.curveball]) {
    assert.ok(recommendation?.action);
    assert.ok(recommendation?.whyItMatters);
    assert.ok(recommendation?.effort);
  }
});

test("POST /api/check/session/:id/cycle reuses an unfinished cycle", async () => {
  const service = createTestCheckRouteService();
  const created = await createCheckSession(service);
  const firstCycleId = created.cycles[0]?.id;
  const response = await handleCheckCycleRequest(jsonRequest(`http://localhost/api/check/session/${created.id}/cycle`, {}), created.id, {
    service,
  });
  const payload = await responsePayload(response);

  assert.equal(response.status, 200);
  assert.equal(payload.data.reusedActiveCycle, true);
  assert.equal(payload.data.cycle.id, firstCycleId);
  assert.equal(payload.data.session.cycles.length, 1);
});

test("POST /api/check/cycle/:id/commit requires a typed move and updates the project graph", async () => {
  const service = createTestCheckRouteService();
  const created = await createCheckSession(service);
  const cycle = created.cycles[0];

  assert.ok(cycle);

  const invalid = await handleCheckCycleCommitRequest(
    jsonRequest(`http://localhost/api/check/cycle/${cycle.id}/commit`, {
      commitment: "",
    }),
    cycle.id,
    { service },
  );

  assert.equal(invalid.status, 400);

  const response = await handleCheckCycleCommitRequest(
    jsonRequest(`http://localhost/api/check/cycle/${cycle.id}/commit`, {
      commitment: "Instead of selling generic brainstorming, frame the product around one investor-readiness decision.",
      recommendationId: cycle.curveball.id,
      stance: "modify",
    }),
    cycle.id,
    { service },
  );
  const payload = await responsePayload(response);
  const updatedSession = payload.data.session;

  assert.equal(response.status, 200);
  assert.equal(payload.data.cycle.status, "committed");
  assert.equal(payload.data.cycle.userCommitment.text, "Instead of selling generic brainstorming, frame the product around one investor-readiness decision.");
  assert.equal(payload.data.cycle.workSprint.steps.length, 3);
  assert.equal(updatedSession.project.nodes.length, created.project.nodes.length + 1);
  assert.equal(updatedSession.project.nodes.at(-1)?.kind, "wild_idea");
  assert.match(payload.data.breakthrough.title, /Breakthrough/);
});

test("POST /api/check/cycle/:id/sprint completes the cycle only after commitment and returns synthesis", async () => {
  const service = createTestCheckRouteService();
  const created = await createCheckSession(service);
  const cycle = created.cycles[0];

  assert.ok(cycle);

  const blocked = await handleCheckCycleSprintRequest(
    jsonRequest(`http://localhost/api/check/cycle/${cycle.id}/sprint`, {
      sprintText: "I drafted the sharper claim.",
    }),
    cycle.id,
    { service },
  );

  assert.equal(blocked.status, 409);

  await handleCheckCycleCommitRequest(
    jsonRequest(`http://localhost/api/check/cycle/${cycle.id}/commit`, {
      commitment: "Write a one-sentence claim for the pitch deck.",
      recommendationId: cycle.recommendations[0]?.id,
      stance: "accept",
    }),
    cycle.id,
    { service },
  );

  const response = await handleCheckCycleSprintRequest(
    jsonRequest(`http://localhost/api/check/cycle/${cycle.id}/sprint`, {
      sprintText: "Penny turns messy startup ideas into investor-ready claims by forcing one focus, one objection, and one next move.",
    }),
    cycle.id,
    { service },
  );
  const payload = await responsePayload(response);

  assert.equal(response.status, 200);
  assert.equal(payload.data.cycle.status, "completed");
  assert.equal(payload.data.session.activeCycleId, null);
  assert.match(payload.data.synthesis.whatChanged.join(" "), /investor-ready claims/);
  assert.match(payload.data.synthesis.nextSuggestedCheck, /Pressure-test|next Check/);
});

test("POST /api/check/session/:id/node lets the user add a custom node at any time", async () => {
  const service = createTestCheckRouteService();
  const created = await createCheckSession(service);
  const response = await handleCheckNodeRequest(
    jsonRequest(`http://localhost/api/check/session/${created.id}/node`, {
      kind: "question",
      title: "What would an investor reject first?",
      body: "Use this as the next pressure test.",
    }),
    created.id,
    { service },
  );
  const payload = await responsePayload(response);

  assert.equal(response.status, 201);
  assert.equal(payload.data.node.kind, "question");
  assert.equal(payload.data.session.project.nodes.at(-1)?.title, "What would an investor reject first?");
});

test("GET /api/check/session/:id and save-to-brain expose the latest Check state", async () => {
  const service = createTestCheckRouteService();
  const created = await createCheckSession(service);
  const getResponse = await handleCheckSessionRequest(new Request(`http://localhost/api/check/session/${created.id}`), created.id, {
    service,
  });
  const getPayload = await responsePayload(getResponse);

  assert.equal(getResponse.status, 200);
  assert.equal(getPayload.data.session.id, created.id);

  const saveResponse = await handleCheckSaveToBrainRequest(
    jsonRequest(`http://localhost/api/check/session/${created.id}/save-to-brain`, {}),
    created.id,
    { service },
  );
  const savePayload = await responsePayload(saveResponse);

  assert.equal(saveResponse.status, 201);
  assert.equal(savePayload.data.savedObject.objectType, "check_breakthrough");
  assert.equal(savePayload.data.session.status, "saved");
});

function createTestCheckRouteService() {
  return createInMemoryCheckRouteService({ aiProvider: createDemoCheckCycleProvider() });
}

async function createCheckSession(service = createTestCheckRouteService()): Promise<CheckSession> {
  const response = await handleCheckSessionCollectionRequest(
    jsonRequest("http://localhost/api/check/session", {
      rawText:
        "We are drafting a strategy memo for Penny. It needs to explain why structured thinking beats a generic chatbot for founders, researchers, and product teams.",
    }),
    { service },
  );
  const payload = await responsePayload(response);

  return payload.data.session;
}

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-user-id": "test-user",
      "x-workspace-id": "test-workspace",
      "x-project-id": "test-project",
      "x-sphere-id": "test-sphere",
    },
    body: JSON.stringify(body),
  });
}

async function responsePayload(response: Response): Promise<any> {
  return (await response.json()) as any;
}
