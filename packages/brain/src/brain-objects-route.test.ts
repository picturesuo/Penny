import assert from "node:assert/strict";
import test from "node:test";
import {
  BrainObjectsNotFoundError,
  buildBrainObjects,
  handleBrainObjectsRequest,
  handleBrainRecentsRequest,
  handleSaveBrainObjectRequest,
  handleSessionNotesRequest,
  type BrainObjectDto,
  type BrainObjectsPayload,
  type BrainObjectsRouteService,
  type BrainRecentDto,
  type BrainRecentsPayload,
  type BrainSessionNoteDto,
  type CreateBrainRecentInput,
  type SaveBrainObjectInput,
  type SaveSessionNoteInput,
} from "./brain-objects-route.ts";
import type { BrainScope } from "./scope.ts";

type BrainObjectsState = Parameters<typeof buildBrainObjects>[0];

const scope: BrainScope = {
  userId: "dev-user",
  workspaceId: "dev-workspace",
  projectId: "dev-project",
  sphereId: "dev-sphere",
};

test("buildBrainObjects maps existing graph rows into BrainObject facade DTOs", () => {
  const sessionId = uuidAt(101);
  const sourceId = uuidAt(201);
  const claimId = uuidAt(301);
  const currentVersionId = uuidAt(401);
  const oldVersionId = uuidAt(402);
  const edgeId = uuidAt(501);
  const moveId = uuidAt(601);
  const artifactId = uuidAt(701);
  const noteId = uuidAt(801);
  const brainObjectId = uuidAt(901);
  const recentId = uuidAt(902);
  const payload = buildBrainObjects({
    scope,
    sessions: [sessionRow(sessionId)],
    sources: [sourceRow(sourceId, sessionId, "A founder should drop an idea before it becomes a document.")],
    claims: [claimRow(claimId, sessionId, sourceId, "assumption")],
    claimVersions: [
      versionRow(oldVersionId, claimId, sourceId, "Old wording should not be exposed.", false, "2026-04-29T12:05:00.000Z"),
      versionRow(
        currentVersionId,
        claimId,
        sourceId,
        "Current assumption preserved through claim_versions.",
        true,
        "2026-04-29T12:10:00.000Z",
      ),
    ],
    edges: [edgeRow(edgeId, sessionId, claimId, uuidAt(302), "depends_on")],
    moves: [moveRow(moveId, sessionId, "learning_triggered")],
    artifacts: [artifactRow(artifactId, sessionId)],
    notes: [noteRow(noteId, sessionId, "Keep the founder-risk thread visible.")],
    brainObjects: [brainObjectRow(brainObjectId, sessionId, recentId, "saved_idea")],
  });

  const claimObject = objectById(payload, `claim:${claimId}`);
  const sessionObject = objectById(payload, `session:${sessionId}`);
  const noteObject = objectById(payload, `session_note:${sessionId}`);
  const savedObject = objectById(payload, `brain_object:${brainObjectId}`);

  assert.equal(payload.sourceOfTruth, "sessions_sources_claims_claim_versions_claim_edges_moves_artifacts_brain_objects_session_notes");
  assert.equal(payload.meta.sessionCount, 1);
  assert.equal(payload.meta.savedObjectCount, 1);
  assert.equal(payload.meta.noteCount, 1);
  assert.equal(sessionObject.objectType, "dropped_idea");
  assert.deepEqual(sessionObject.refs.sourceIds, [sourceId]);
  assert.deepEqual(sessionObject.refs.moveIds, [moveId]);
  assert.equal(claimObject.objectType, "claim");
  assert.equal(claimObject.preview, "Current assumption preserved through claim_versions.");
  assert.deepEqual(claimObject.refs.claimIds, [claimId]);
  assert.deepEqual(claimObject.refs.claimVersionIds, [currentVersionId]);
  assert.equal(claimObject.refs.claimVersionIds.includes(oldVersionId), false);
  assert.deepEqual(claimObject.refs.edgeIds, [edgeId]);
  assert.deepEqual(claimObject.refs.sourceIds, [sourceId]);
  assert.equal(noteObject.objectType, "working_note");
  assert.equal(noteObject.preview, "Keep the founder-risk thread visible.");
  assert.equal(savedObject.backing?.table, "brain_objects");
  assert.equal(savedObject.objectType, "saved_idea");
});

test("GET /api/brain/objects delegates with header scope", async () => {
  const calls: BrainScope[] = [];
  const response = await handleBrainObjectsRequest(scopedRequest("http://localhost/api/brain/objects"), {
    service: routeService({
      async listObjects(requestScope) {
        calls.push(requestScope);
        return emptyObjects();
      },
    }),
  });
  const body = (await response.json()) as { data: BrainObjectsPayload };

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [scope]);
  assert.deepEqual(body.data.objects, []);
});

test("POST /api/brain/objects/save persists either recent output or direct content", async () => {
  const saved: SaveBrainObjectInput[] = [];
  const response = await handleSaveBrainObjectRequest(
    scopedJsonRequest("http://localhost/api/brain/objects/save", {
      recentId: uuidAt(901),
      title: "Save the learning output",
    }),
    {
      service: routeService({
        async saveObject(input) {
          saved.push(input);
          return objectDto("brain_object", "saved_idea");
        },
      }),
    },
  );
  const body = (await response.json()) as { data: { object: BrainObjectDto } };

  assert.equal(response.status, 201);
  assert.equal(saved[0]?.recentId, uuidAt(901));
  assert.equal(saved[0]?.title, "Save the learning output");
  assert.deepEqual(saved[0]?.scope, scope);
  assert.equal(body.data.object.objectType, "saved_idea");
});

test("GET and POST /api/brain/recents keep lightweight Learn outputs", async () => {
  const created: CreateBrainRecentInput[] = [];
  const service = routeService({
    async listRecents(requestScope) {
      assert.deepEqual(requestScope, scope);
      return recentsPayload([recentDto("Raw dropped idea")]);
    },
    async createRecent(input) {
      created.push(input);
      const recent = recentDto(input.rawIdea ?? input.content ?? "");
      return { recent, recents: [recent] };
    },
  });

  const listed = await handleBrainRecentsRequest(scopedRequest("http://localhost/api/brain/recents"), { service });
  const posted = await handleBrainRecentsRequest(
    scopedJsonRequest("http://localhost/api/brain/recents", {
      rawIdea: "Unsaved Learn output that should stay lightweight.",
    }),
    { service },
  );
  const listedBody = (await listed.json()) as { data: BrainRecentsPayload };
  const postedBody = (await posted.json()) as { data: { recent: BrainRecentDto; recents: BrainRecentDto[] } };

  assert.equal(listed.status, 200);
  assert.equal(listedBody.data.recents[0]?.rawIdea, "Raw dropped idea");
  assert.equal(posted.status, 201);
  assert.equal(created[0]?.rawIdea, "Unsaved Learn output that should stay lightweight.");
  assert.deepEqual(created[0]?.scope, scope);
  assert.equal(postedBody.data.recent.rawIdea, "Unsaved Learn output that should stay lightweight.");
});

test("created Brain recents are returned by a later read", async () => {
  const recents: BrainRecentDto[] = [];
  const service = routeService({
    async listRecents(requestScope) {
      assert.deepEqual(requestScope, scope);
      return recentsPayload(recents);
    },
    async createRecent(input) {
      const recent = {
        ...recentDto(input.rawIdea ?? input.content ?? ""),
        id: uuidAt(910 + recents.length),
        scope: input.scope,
      };
      recents.unshift(recent);
      return { recent, recents };
    },
  });

  const created = await handleBrainRecentsRequest(
    scopedJsonRequest("http://localhost/api/brain/recents", {
      rawIdea: "Drop idea before structure, then read it back.",
    }),
    { service },
  );
  const listed = await handleBrainRecentsRequest(scopedRequest("http://localhost/api/brain/recents"), { service });
  const createdBody = (await created.json()) as { data: { recent: BrainRecentDto } };
  const listedBody = (await listed.json()) as { data: BrainRecentsPayload };

  assert.equal(created.status, 201);
  assert.equal(createdBody.data.recent.rawIdea, "Drop idea before structure, then read it back.");
  assert.deepEqual(
    listedBody.data.recents.map((recent) => recent.id),
    [createdBody.data.recent.id],
  );
});

test("POST /api/brain/recents accepts Learn session outputs for later Brain saves", async () => {
  const sessionId = uuidAt(101);
  const created: CreateBrainRecentInput[] = [];
  const response = await handleBrainRecentsRequest(
    scopedJsonRequest("http://localhost/api/brain/recents", {
      learnOutput: {
        sessionId,
        title: "Learn: cognitive load",
        summary: "Cognitive load changes what Penny should preserve.",
        content: "The Learn session explains why cognitive load matters for the current claim.",
        term: "cognitive load",
        candidateBrainObjects: [
          {
            objectType: "learn_output",
            title: "Learn: cognitive load",
            summary: "Save the local definition and its claim pressure.",
            content: "Cognitive load matters because the claim depends on reducing user effort.",
            suggestedSaveReason: "This concept will keep shaping the session.",
            source: "learn",
            refs: {
              sessionId,
              currentClaimId: uuidAt(301),
              term: "cognitive load",
            },
          },
        ],
      },
    }),
    {
      service: routeService({
        async createRecent(input) {
          created.push(input);
          const recent = {
            ...recentDto(input.content ?? ""),
            id: uuidAt(930),
            sessionId: input.sessionId ?? null,
            kind: input.kind ?? "learn_output",
            title: input.title ?? "Learn output",
            summary: input.summary ?? null,
            payload: input.payload ?? {},
          };

          return { recent, recents: [recent] };
        },
      }),
    },
  );
  const body = (await response.json()) as { data: { recent: BrainRecentDto } };
  const payload = created[0]?.payload as Record<string, unknown> | undefined;
  const learnSessionOutput = payload?.learnSessionOutput as Record<string, unknown> | undefined;
  const candidateBrainObjects = payload?.candidateBrainObjects as unknown[] | undefined;

  assert.equal(response.status, 201);
  assert.equal(created[0]?.kind, "learn_output");
  assert.equal(created[0]?.sessionId, sessionId);
  assert.equal(created[0]?.title, "Learn: cognitive load");
  assert.equal(created[0]?.content, "The Learn session explains why cognitive load matters for the current claim.");
  assert.equal(payload?.source, "learn");
  assert.equal(learnSessionOutput?.term, "cognitive load");
  assert.equal(candidateBrainObjects?.length, 1);
  assert.equal(body.data.recent.kind, "learn_output");
});

test("new Brain object endpoints keep persisted rows isolated by scope", async () => {
  const otherScope: BrainScope = { ...scope, userId: "other-user" };
  const sessionId = uuidAt(101);
  const persistedRecent = recentDto("Scoped dropped idea.");
  const persistedObject = objectDto("brain_object", "saved_idea");
  const persistedNote = noteDto(sessionId, "Scoped working note.");
  const service = routeService({
    async listRecents(requestScope) {
      return recentsPayload(sameScope(requestScope, scope) ? [persistedRecent] : []);
    },
    async listObjects(requestScope) {
      return {
        ...emptyObjects(),
        objects: sameScope(requestScope, scope) ? [persistedObject] : [],
        meta: {
          objectCount: sameScope(requestScope, scope) ? 1 : 0,
          sessionCount: 0,
          savedObjectCount: sameScope(requestScope, scope) ? 1 : 0,
          noteCount: 0,
        },
      };
    },
    async getSessionNote(requestScope, requestSessionId) {
      if (requestSessionId === sessionId && sameScope(requestScope, scope)) {
        return persistedNote;
      }

      throw new BrainObjectsNotFoundError("Session was not found in this scope.");
    },
    async saveObject(input) {
      if (input.recentId === persistedRecent.id && sameScope(input.scope, scope)) {
        return persistedObject;
      }

      throw new BrainObjectsNotFoundError("Recent item was not found in this scope.");
    },
  });

  const visibleRecents = await handleBrainRecentsRequest(scopedRequest("http://localhost/api/brain/recents"), { service });
  const hiddenRecents = await handleBrainRecentsRequest(scopedRequestFor("http://localhost/api/brain/recents", otherScope), {
    service,
  });
  const visibleObjects = await handleBrainObjectsRequest(scopedRequest("http://localhost/api/brain/objects"), { service });
  const hiddenObjects = await handleBrainObjectsRequest(scopedRequestFor("http://localhost/api/brain/objects", otherScope), {
    service,
  });
  const hiddenNote = await handleSessionNotesRequest(
    scopedRequestFor(`http://localhost/api/sessions/${sessionId}/notes`, otherScope),
    sessionId,
    { service },
  );
  const hiddenSave = await handleSaveBrainObjectRequest(
    scopedJsonRequestFor(
      "http://localhost/api/brain/objects/save",
      {
        recentId: persistedRecent.id,
      },
      otherScope,
    ),
    { service },
  );
  const visibleRecentsBody = (await visibleRecents.json()) as { data: BrainRecentsPayload };
  const hiddenRecentsBody = (await hiddenRecents.json()) as { data: BrainRecentsPayload };
  const visibleObjectsBody = (await visibleObjects.json()) as { data: BrainObjectsPayload };
  const hiddenObjectsBody = (await hiddenObjects.json()) as { data: BrainObjectsPayload };
  const hiddenNoteBody = (await hiddenNote.json()) as { error: { code: string } };
  const hiddenSaveBody = (await hiddenSave.json()) as { error: { code: string } };

  assert.equal(visibleRecentsBody.data.recents[0]?.id, persistedRecent.id);
  assert.deepEqual(hiddenRecentsBody.data.recents, []);
  assert.equal(visibleObjectsBody.data.objects[0]?.id, persistedObject.id);
  assert.deepEqual(hiddenObjectsBody.data.objects, []);
  assert.equal(hiddenNote.status, 404);
  assert.equal(hiddenNoteBody.error.code, "brain_object_not_found");
  assert.equal(hiddenSave.status, 404);
  assert.equal(hiddenSaveBody.error.code, "brain_object_not_found");
});

test("saved session notes survive a later refresh-style read", async () => {
  const sessionId = uuidAt(101);
  let persisted: BrainSessionNoteDto | null = null;
  const service = routeService({
    async getSessionNote(requestScope, requestSessionId) {
      assert.deepEqual(requestScope, scope);
      assert.equal(requestSessionId, sessionId);
      return persisted;
    },
    async saveSessionNote(input) {
      assert.deepEqual(input.scope, scope);
      persisted = noteDto(input.sessionId, input.content);
      return persisted;
    },
  });

  const saved = await handleSessionNotesRequest(
    scopedJsonRequest(`http://localhost/api/sessions/${sessionId}/notes`, {
      content: "Reload should keep the working note.",
    }, "PUT"),
    sessionId,
    { service },
  );
  const refreshed = await handleSessionNotesRequest(scopedRequest(`http://localhost/api/sessions/${sessionId}/notes`), sessionId, {
    service,
  });
  const savedBody = (await saved.json()) as { data: { note: BrainSessionNoteDto } };
  const refreshedBody = (await refreshed.json()) as { data: { note: BrainSessionNoteDto | null } };

  assert.equal(saved.status, 200);
  assert.equal(savedBody.data.note.content, "Reload should keep the working note.");
  assert.equal(refreshed.status, 200);
  assert.equal(refreshedBody.data.note?.content, savedBody.data.note.content);
});

test("GET, POST, and PUT /api/sessions/:sessionId/notes persist working notes", async () => {
  const sessionId = uuidAt(101);
  const saved: SaveSessionNoteInput[] = [];
  const service = routeService({
    async getSessionNote(requestScope, requestSessionId) {
      assert.deepEqual(requestScope, scope);
      assert.equal(requestSessionId, sessionId);
      return noteDto(sessionId, "Existing note.");
    },
    async saveSessionNote(input) {
      saved.push(input);
      return noteDto(input.sessionId, input.content);
    },
  });

  const fetched = await handleSessionNotesRequest(scopedRequest(`http://localhost/api/sessions/${sessionId}/notes`), sessionId, {
    service,
  });
  const posted = await handleSessionNotesRequest(
    scopedJsonRequest(`http://localhost/api/sessions/${sessionId}/notes`, { content: "Saved from POST." }),
    sessionId,
    { service },
  );
  const put = await handleSessionNotesRequest(
    scopedJsonRequest(`http://localhost/api/sessions/${sessionId}/notes`, { content: "Saved from PUT." }, "PUT"),
    sessionId,
    { service },
  );
  const fetchedBody = (await fetched.json()) as { data: { note: BrainSessionNoteDto | null } };
  const postedBody = (await posted.json()) as { data: { note: BrainSessionNoteDto } };
  const putBody = (await put.json()) as { data: { note: BrainSessionNoteDto } };

  assert.equal(fetched.status, 200);
  assert.equal(fetchedBody.data.note?.content, "Existing note.");
  assert.equal(posted.status, 200);
  assert.equal(postedBody.data.note.content, "Saved from POST.");
  assert.equal(put.status, 200);
  assert.equal(putBody.data.note.content, "Saved from PUT.");
  assert.deepEqual(saved.map((input) => input.content), ["Saved from POST.", "Saved from PUT."]);
  assert.deepEqual(saved.map((input) => input.scope), [scope, scope]);
});

test("session notes reject invalid session ids before service calls", async () => {
  const calls: string[] = [];
  const response = await handleSessionNotesRequest(scopedRequest("http://localhost/api/sessions/not-a-uuid/notes"), "not-a-uuid", {
    service: routeService({
      async getSessionNote() {
        calls.push("getSessionNote");
        return null;
      },
    }),
  });
  const body = (await response.json()) as { error: { code: string } };

  assert.equal(response.status, 400);
  assert.equal(body.error.code, "invalid_request");
  assert.deepEqual(calls, []);
});

function objectById(payload: BrainObjectsPayload, id: string): BrainObjectDto {
  const object = payload.objects.find((candidate) => candidate.id === id);
  assert.ok(object, `Expected object ${id}`);
  return object;
}

function emptyObjects(): BrainObjectsPayload {
  return {
    sourceOfTruth: "sessions_sources_claims_claim_versions_claim_edges_moves_artifacts_brain_objects_session_notes",
    objects: [],
    meta: {
      objectCount: 0,
      sessionCount: 0,
      savedObjectCount: 0,
      noteCount: 0,
    },
  };
}

function routeService(overrides: Partial<BrainObjectsRouteService> = {}): BrainObjectsRouteService {
  return {
    async listObjects() {
      return emptyObjects();
    },
    async saveObject() {
      return objectDto("brain_object", "learn_output");
    },
    async listRecents() {
      return recentsPayload([]);
    },
    async createRecent(input) {
      const recent = recentDto(input.rawIdea ?? input.content ?? "");
      return { recent, recents: [recent] };
    },
    async getSessionNote() {
      return null;
    },
    async saveSessionNote(input) {
      return noteDto(input.sessionId, input.content);
    },
    ...overrides,
  };
}

function scopedRequest(url: string, method = "GET"): Request {
  return scopedRequestFor(url, scope, method);
}

function scopedRequestFor(url: string, requestScope: BrainScope, method = "GET"): Request {
  return new Request(url, { method, headers: scopeHeaders(requestScope) });
}

function scopedJsonRequest(url: string, body: unknown, method = "POST"): Request {
  return scopedJsonRequestFor(url, body, scope, method);
}

function scopedJsonRequestFor(url: string, body: unknown, requestScope: BrainScope, method = "POST"): Request {
  return new Request(url, {
    method,
    headers: {
      ...scopeHeaders(requestScope),
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function scopeHeaders(requestScope: BrainScope): Record<string, string> {
  return {
    "x-user-id": requestScope.userId ?? "",
    "x-workspace-id": requestScope.workspaceId ?? "",
    "x-project-id": requestScope.projectId ?? "",
    "x-sphere-id": requestScope.sphereId ?? "",
  };
}

function recentsPayload(recents: BrainRecentDto[]): BrainRecentsPayload {
  return { recents };
}

function objectDto(table: string, objectType: string): BrainObjectDto {
  return {
    id: `${table}:${uuidAt(999)}`,
    objectType,
    backing: { table, id: uuidAt(999) },
    scope,
    sessionId: uuidAt(101),
    parentId: `session:${uuidAt(101)}`,
    title: "Saved object",
    summary: null,
    preview: "Saved object body.",
    status: objectType,
    createdAt: "2026-04-29T12:00:00.000Z",
    updatedAt: "2026-04-29T12:00:00.000Z",
    refs: {
      claimIds: [],
      claimVersionIds: [],
      edgeIds: [],
      sourceIds: [],
      moveIds: [],
      artifactIds: [],
    },
  };
}

function recentDto(rawIdea: string): BrainRecentDto {
  return {
    id: uuidAt(901),
    scope,
    sessionId: null,
    kind: "raw_idea",
    title: rawIdea.slice(0, 80) || "Recent idea",
    summary: null,
    rawIdea,
    content: rawIdea,
    payload: {},
    createdAt: "2026-04-29T12:00:00.000Z",
    updatedAt: "2026-04-29T12:00:00.000Z",
  };
}

function noteDto(sessionId: string, content: string): BrainSessionNoteDto {
  return {
    id: uuidAt(801),
    scope,
    sessionId,
    content,
    createdAt: "2026-04-29T12:00:00.000Z",
    updatedAt: "2026-04-29T12:05:00.000Z",
  };
}

function sameScope(left: BrainScope, right: BrainScope): boolean {
  return (
    left.userId === right.userId &&
    left.workspaceId === right.workspaceId &&
    left.projectId === right.projectId &&
    left.sphereId === right.sphereId
  );
}

function sessionRow(id: string): BrainObjectsState["sessions"][number] {
  return {
    id,
    ...scope,
    status: "open",
    title: "Dropped founder idea",
    createdAt: new Date("2026-04-29T12:00:00.000Z"),
    endedAt: null,
  };
}

function sourceRow(id: string, sessionId: string, rawText: string): BrainObjectsState["sources"][number] {
  return {
    id,
    ...scope,
    sessionId,
    kind: "raw_idea",
    rawText,
    createdAt: new Date("2026-04-29T12:00:00.000Z"),
  };
}

function claimRow(
  id: string,
  sessionId: string,
  sourceId: string,
  kind: BrainObjectsState["claims"][number]["kind"],
): BrainObjectsState["claims"][number] {
  return {
    id,
    ...scope,
    sessionId,
    sourceId,
    kind,
    createdAt: new Date("2026-04-29T12:04:00.000Z"),
  };
}

function versionRow(
  id: string,
  claimId: string,
  sourceId: string,
  content: string,
  isCurrent: boolean,
  createdAt: string,
): BrainObjectsState["claimVersions"][number] {
  return {
    id,
    claimId,
    sourceId,
    brainRunId: null,
    moveId: null,
    content,
    status: "exploratory",
    confidence: 60,
    isCurrent,
    validFrom: new Date(createdAt),
    validUntil: isCurrent ? null : new Date("2026-04-29T12:09:00.000Z"),
    supersededByVersionId: isCurrent ? null : uuidAt(401),
    createdAt: new Date(createdAt),
  };
}

function edgeRow(
  id: string,
  sessionId: string,
  fromClaimId: string,
  toClaimId: string,
  kind: BrainObjectsState["edges"][number]["kind"],
): BrainObjectsState["edges"][number] {
  return {
    id,
    ...scope,
    sessionId,
    fromClaimId,
    toClaimId,
    kind,
    status: "active",
    label: null,
    createdAt: new Date("2026-04-29T12:06:00.000Z"),
  };
}

function moveRow(
  id: string,
  sessionId: string,
  kind: BrainObjectsState["moves"][number]["kind"],
): BrainObjectsState["moves"][number] {
  return {
    id,
    ...scope,
    sessionId,
    kind,
    summary: "Learned from the dropped idea.",
    payload: {},
    createdAt: new Date("2026-04-29T12:20:00.000Z"),
  };
}

function artifactRow(id: string, sessionId: string): BrainObjectsState["artifacts"][number] {
  return {
    id,
    ...scope,
    sessionId,
    kind: "challenge_brief",
    title: "Challenge Brief",
    summary: "Challenge the riskiest assumption.",
    payload: {},
    createdAt: new Date("2026-04-29T12:25:00.000Z"),
  };
}

function noteRow(id: string, sessionId: string, content: string): BrainObjectsState["notes"][number] {
  return {
    id,
    ...scope,
    sessionId,
    content,
    createdAt: new Date("2026-04-29T12:30:00.000Z"),
    updatedAt: new Date("2026-04-29T12:31:00.000Z"),
  };
}

function brainObjectRow(
  id: string,
  sessionId: string,
  sourceRecentId: string,
  objectType: string,
): BrainObjectsState["brainObjects"][number] {
  return {
    id,
    ...scope,
    sessionId,
    sourceRecentId,
    objectType,
    title: "Saved learning output",
    summary: "Promoted from recents.",
    body: "This lightweight recent has been saved into durable Brain.",
    payload: {},
    createdAt: new Date("2026-04-29T12:35:00.000Z"),
    updatedAt: new Date("2026-04-29T12:40:00.000Z"),
  };
}

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}
