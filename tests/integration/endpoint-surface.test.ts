import assert from "node:assert/strict";
import { test } from "node:test";

import { POST as captureThought } from "../../apps/web/app/ai/capture-thought/route.ts";
import { POST as challengeIdea } from "../../apps/web/app/ai/challenge-idea/route.ts";
import { POST as detectContradictions } from "../../apps/web/app/ai/detect-contradictions/route.ts";
import { POST as explainBlocker } from "../../apps/web/app/ai/explain-blocker/route.ts";
import { POST as extractClaims } from "../../apps/web/app/ai/extract-claims/route.ts";
import { POST as suggestConnections } from "../../apps/web/app/ai/suggest-connections/route.ts";
import { POST as summarizeMap } from "../../apps/web/app/ai/summarize-map/route.ts";
import { GET as getActivity } from "../../apps/web/app/api/activity/route.ts";
import { GET as getClaims } from "../../apps/web/app/api/claims/route.ts";
import { POST as recordConfidence } from "../../apps/web/app/api/confidence/route.ts";
import { GET as getGraph } from "../../apps/web/app/api/graph/route.ts";
import { GET as getGraphNodeDetail } from "../../apps/web/app/api/graph/nodes/[id]/detail/route.ts";
import { GET as search } from "../../apps/web/app/api/search/route.ts";
import { GET as getSessions } from "../../apps/web/app/api/sessions/route.ts";
import { GET as getThoughts } from "../../apps/web/app/api/thoughts/route.ts";

test("requested frontend-backend endpoint surface is mounted", () => {
  assert.equal(typeof getThoughts, "function", "GET /api/thoughts");
  assert.equal(typeof getClaims, "function", "GET /api/claims");
  assert.equal(typeof getActivity, "function", "GET /api/activity");
  assert.equal(typeof getSessions, "function", "GET /api/sessions");
  assert.equal(typeof getGraph, "function", "GET /api/graph");
  assert.equal(typeof getGraphNodeDetail, "function", "GET /api/graph/nodes/:id/detail");
  assert.equal(typeof search, "function", "GET /api/search");
  assert.equal(typeof recordConfidence, "function", "POST /api/confidence");
  assert.equal(typeof captureThought, "function", "POST /ai/capture-thought");
  assert.equal(typeof challengeIdea, "function", "POST /ai/challenge-idea");
  assert.equal(typeof detectContradictions, "function", "POST /ai/detect-contradictions");
  assert.equal(typeof explainBlocker, "function", "POST /ai/explain-blocker");
  assert.equal(typeof extractClaims, "function", "POST /ai/extract-claims");
  assert.equal(typeof suggestConnections, "function", "POST /ai/suggest-connections");
  assert.equal(typeof summarizeMap, "function", "POST /ai/summarize-map");
});
