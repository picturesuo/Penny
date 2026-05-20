import assert from "node:assert/strict";
import test from "node:test";
import { completeGoogleConnectorSync, initializeGoogleConnectorConnection, revokeGoogleConnectorAccess } from "./google-connector.ts";
import {
  createInMemoryGoogleConnectorStateStore,
  emptyGoogleConnectorState,
  mergeGoogleConnectorStates,
  resolveDefaultGoogleConnectorStateStore,
} from "./google-connector-state-store.ts";

test("Google connector in-memory state store scopes connections and source refs", async () => {
  const scope = { userId: "user-1", workspaceId: "workspace-1", projectId: null, sphereId: null };
  const otherScope = { userId: "user-2", workspaceId: "workspace-1", projectId: null, sphereId: null };
  const initial = initializeGoogleConnectorConnection({
    scope,
    credential: {
      providerId: "google",
      adapter: "nango",
      connectionId: "nango-google-1",
      providerConfigKey: "google",
      credentialRef: "nango:google:nango-google-1",
      endUserId: "user-1",
    },
    surfaces: ["google_drive"],
    scopes: ["https://www.googleapis.com/auth/drive.file"],
    now: "2026-05-20T12:00:00.000Z",
  });
  const completed = completeGoogleConnectorSync({
    state: initial,
    scope,
    connectionId: initial.connections[0]?.id ?? "",
    jobId: initial.syncJobs[0]?.id ?? "",
    surface: "google_drive",
    now: "2026-05-20T12:01:00.000Z",
    cursor: "drive-cursor-1",
    nextSyncAt: "2026-05-20T18:01:00.000Z",
    sources: [
      {
        surface: "google_drive",
        kind: "google_doc",
        externalId: "doc-1",
        sourceUri: "google-drive:file:doc-1",
        label: "Strategy doc",
        url: "https://docs.google.com/document/d/doc-1",
        brainSourceId: "brain-source-1",
        brainNodeIds: ["memory-1"],
      },
    ],
  });
  const store = createInMemoryGoogleConnectorStateStore();

  await store.save(completed);

  const loaded = await store.load(scope);
  const otherLoaded = await store.load(otherScope);

  assert.equal(loaded.connections.length, 1);
  assert.equal(loaded.connections[0]?.sourceCounts.google_doc, 1);
  assert.equal(loaded.cursors[0]?.cursor, "drive-cursor-1");
  assert.equal(loaded.sources[0]?.brainSourceId, "brain-source-1");
  assert.equal(loaded.sources[0]?.privacy.retrievalAccess, "enabled");
  assert.equal(otherLoaded.connections.length, 0);
  assert.equal(otherLoaded.sources.length, 0);
});

test("Google connector in-memory state store clones and preserves revoked updates", async () => {
  const scope = { userId: "user-1", workspaceId: null, projectId: null, sphereId: null };
  const initial = initializeGoogleConnectorConnection({
    scope,
    credential: {
      providerId: "google",
      adapter: "nango",
      connectionId: "nango-google-1",
      providerConfigKey: "google",
      credentialRef: "nango:google:nango-google-1",
    },
    surfaces: ["google_calendar"],
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    now: "2026-05-20T12:00:00.000Z",
  });
  const store = createInMemoryGoogleConnectorStateStore(initial);
  const loaded = await store.load(scope);

  loaded.connections[0]?.surfaces.push("google_gmail");

  const loadedAgain = await store.load(scope);
  assert.deepEqual(loadedAgain.connections[0]?.surfaces, ["google_calendar"]);

  const revoked = revokeGoogleConnectorAccess({
    state: loadedAgain,
    scope,
    connectionId: loadedAgain.connections[0]?.id ?? "",
    now: "2026-05-20T12:02:00.000Z",
  });

  await store.save(revoked);

  const reloaded = await store.load(scope);
  assert.equal(reloaded.connections[0]?.status, "revoked");
  assert.equal(reloaded.connections[0]?.nextSyncAt, null);
  assert.equal(reloaded.audits.some((audit) => audit.event === "connector.revoked"), true);
});

test("mergeGoogleConnectorStates updates by id without dropping other scopes", () => {
  const userOne = initializeGoogleConnectorConnection({
    scope: { userId: "user-1", workspaceId: null, projectId: null, sphereId: null },
    credential: {
      providerId: "google",
      adapter: "nango",
      connectionId: "nango-google-1",
      providerConfigKey: "google",
      credentialRef: "nango:google:nango-google-1",
    },
    surfaces: ["google_drive"],
    scopes: ["https://www.googleapis.com/auth/drive.file"],
    now: "2026-05-20T12:00:00.000Z",
  });
  const userTwo = initializeGoogleConnectorConnection({
    scope: { userId: "user-2", workspaceId: null, projectId: null, sphereId: null },
    credential: {
      providerId: "google",
      adapter: "nango",
      connectionId: "nango-google-2",
      providerConfigKey: "google",
      credentialRef: "nango:google:nango-google-2",
    },
    surfaces: ["google_calendar"],
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    now: "2026-05-20T12:00:00.000Z",
  });
  const merged = mergeGoogleConnectorStates(mergeGoogleConnectorStates(emptyGoogleConnectorState(), userOne), userTwo);
  const revokedUserOne = revokeGoogleConnectorAccess({
    state: userOne,
    scope: { userId: "user-1", workspaceId: null, projectId: null, sphereId: null },
    connectionId: userOne.connections[0]?.id ?? "",
    now: "2026-05-20T12:02:00.000Z",
  });
  const updated = mergeGoogleConnectorStates(merged, revokedUserOne);

  assert.equal(updated.connections.length, 2);
  assert.equal(updated.connections.find((connection) => connection.scope.userId === "user-1")?.status, "revoked");
  assert.equal(updated.connections.find((connection) => connection.scope.userId === "user-2")?.status, "connected");
});

test("Google connector default state store requires DATABASE_URL in production", () => {
  assert.throws(
    () => resolveDefaultGoogleConnectorStateStore({ NODE_ENV: "production", DATABASE_URL: undefined }),
    /DATABASE_URL is required for Google connector state in production/i,
  );
});
