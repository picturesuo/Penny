import assert from "node:assert/strict";
import { test } from "node:test";

import { createBrainViewModel } from "../../../apps/web/lib/viewmodels/brain/create-brain-view-model.ts";
import type { BrainProjectionView } from "../../../apps/web/lib/viewmodels/brain/types.ts";

test("createBrainViewModel maps Brain projection claims into thought stream and inspector state", () => {
  const projection: BrainProjectionView = {
    currentContext: {
      mode: "brain",
      mapId: "map-1",
      claimId: "claim-2",
    },
    workspaceContext: {
      mode: "brain",
      mapId: "map-1",
      claimId: "claim-2",
    },
    mapSummary: {
      id: "map-1",
      title: "Fundraising map",
      claimCount: 2,
    },
    claims: [
      {
        id: "claim-1",
        mapId: "map-1",
        body: "Enterprise buyers need audit trails before rollout.",
        confidenceBps: 5200,
        createdAt: "2026-04-24T10:00:00.000",
        updatedAt: "2026-04-24T10:05:00.000",
      },
      {
        id: "claim-2",
        mapId: "map-1",
        body: "The wedge should start with founder-led diligence workflows.",
        confidenceBps: 8100,
        createdAt: "2026-04-24T10:10:00.000",
        updatedAt: "2026-04-24T10:20:00.000",
      },
    ],
    selectedClaim: {
      id: "claim-2",
      mapId: "map-1",
      body: "The wedge should start with founder-led diligence workflows.",
      confidenceBps: 8100,
      createdAt: "2026-04-24T10:10:00.000",
      updatedAt: "2026-04-24T10:20:00.000",
    },
    recentEvents: [
      {
        id: "event-1",
        eventType: "claim.updated",
        created_at: "2026-04-24T10:22:00.000",
      },
    ],
  };

  const model = createBrainViewModel(projection);

  assert.equal(model.context.mapTitle, "Fundraising map");
  assert.equal(model.context.sphereLabel, "No sphere projected");
  assert.equal(model.context.claimCountLabel, "2 thoughts");
  assert.equal(model.stream.length, 2);
  assert.deepEqual(
    model.stream.map((thought) => thought.id),
    ["claim-2", "claim-1"],
  );
  assert.equal(model.stream[0]?.bodyPreview, "The wedge should start with founder-led diligence workflows.");
  assert.equal(model.selectedThought?.id, "claim-2");
  assert.equal(model.selectedThought?.confidenceLabel, "81% confidence");
  assert.equal(model.selectedPanel?.title, "The wedge should start with founder-led diligence workflows.");
  assert.equal(model.selectedPanel?.body, "The wedge should start with founder-led diligence workflows.");
  assert.equal(model.selectedPanel?.confidenceLabel, "81% confidence");
  assert.equal(model.selectedPanel?.dependenciesLabel, "1 related claims from this map");
  assert.equal(model.selectedPanel?.brainMapHref, "/brain?claimId=claim-2#brain-map");
  assert.deepEqual(model.selectedPanel?.relatedClaims, [
    {
      id: "claim-1",
      title: "Enterprise buyers need audit trails before rollout.",
      confidenceLabel: "52% confidence",
      confidenceBps: 5200,
      brainMapHref: "/brain?claimId=claim-1#brain-map",
    },
  ]);
  assert.deepEqual(model.sphere.workSphere, {
    id: "work-sphere-map-1",
    label: "Work sphere",
    description: "Fundraising map workspace",
    isSelected: true,
  });
  assert.equal(model.sphere.selectedSessionId, "session-claim-2");
  assert.deepEqual(
    model.sphere.recentSessions.map((session) => ({
      id: session.id,
      title: session.title,
      isSelected: session.isSelected,
    })),
    [
      {
        id: "session-claim-2",
        title: "Current Brain session",
        isSelected: true,
      },
      {
        id: "session-claim-1",
        title: "Recent session 2",
        isSelected: false,
      },
    ],
  );
  assert.equal(model.inspector.status, "Selected thought");
  assert.equal(model.inspector.selectedId, "claim-2");
  assert.deepEqual(model.inspector.keyConnections, [
    {
      id: "claim-1",
      title: "Enterprise buyers need audit trails before rollout.",
      detail: "52% confidence; updated Apr 24, 10:05 AM",
    },
  ]);
  assert.deepEqual(model.inspector.dependencies, [
    {
      id: "map:map-1",
      title: "Parent map",
      detail: "Fundraising map contains this claim.",
    },
  ]);
  assert.deepEqual(model.inspector.contradictionMarkers, [
    {
      id: "claim-1",
      title: "Enterprise buyers need audit trails before rollout.",
      detail: "52% confidence; review against the selected claim.",
    },
  ]);
  assert.deepEqual(model.inspector.recentActivity, [
    {
      id: "event-1",
      title: "claim.updated",
      detail: "Apr 24, 10:22 AM",
    },
  ]);
  assert.deepEqual(
    model.recentThoughts.map((thought) => thought.id),
    ["claim-2", "claim-1"],
  );
});

test("createBrainViewModel keeps empty Brain state explicit", () => {
  const model = createBrainViewModel({
    currentContext: {
      mode: "brain",
      mapId: null,
      claimId: null,
    },
    workspaceContext: {
      mode: "brain",
      mapId: null,
      claimId: null,
    },
    mapSummary: null,
    claims: [],
    selectedClaim: null,
    recentEvents: [],
  });

  assert.equal(model.context.mapTitle, "No map selected");
  assert.equal(model.context.claimCountLabel, "0 thoughts");
  assert.equal(model.stream.length, 0);
  assert.equal(model.selectedThought, null);
  assert.equal(model.selectedPanel, null);
  assert.equal(model.sphere.workSphere.id, "work-sphere-empty");
  assert.equal(model.sphere.workSphere.isSelected, true);
  assert.deepEqual(model.sphere.recentSessions, []);
  assert.equal(model.sphere.selectedSessionId, null);
  assert.equal(model.inspector.status, "No thought selected");
  assert.deepEqual(model.inspector.keyConnections, []);
  assert.deepEqual(model.inspector.dependencies, []);
  assert.deepEqual(model.inspector.contradictionMarkers, []);
  assert.deepEqual(model.inspector.recentActivity, []);
});
