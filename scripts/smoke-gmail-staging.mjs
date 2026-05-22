#!/usr/bin/env node

const baseUrl = env("BASE_URL", "http://localhost:3000").replace(/\/+$/, "");
const apiToken = env("GMAIL_SMOKE_API_TOKEN", env("PENNY_API_TOKEN", ""));
const userId = env("GMAIL_SMOKE_USER_ID", env("PENNY_AUTH_USER_ID", env("PENNY_USER_ID", "gmail-smoke-user")));
const workspaceId = env(
  "GMAIL_SMOKE_WORKSPACE_ID",
  env("PENNY_AUTH_WORKSPACE_ID", env("PENNY_WORKSPACE_ID", "gmail-smoke-workspace")),
);
const projectId = env("GMAIL_SMOKE_PROJECT_ID", env("PENNY_AUTH_PROJECT_ID", env("PENNY_PROJECT_ID", "gmail-smoke-project")));
const sphereId = env("GMAIL_SMOKE_SPHERE_ID", env("PENNY_AUTH_SPHERE_ID", env("PENNY_SPHERE_ID", "gmail-smoke-sphere")));
const connectionId = env("GMAIL_SMOKE_CONNECTION_ID", "");
const providerConfigKey = env("GMAIL_SMOKE_PROVIDER_CONFIG_KEY", "");
const maxResults = positiveInt(env("GMAIL_SMOKE_MAX_RESULTS", "5"), 5);
const keywordText = env("GMAIL_SMOKE_KEYWORD_TEXT", "launch partner evidence");
const keywordFilters = {
  from: env("GMAIL_SMOKE_KEYWORD_FROM", ""),
  to: env("GMAIL_SMOKE_KEYWORD_TO", ""),
  subject: env("GMAIL_SMOKE_KEYWORD_SUBJECT", ""),
  label: env("GMAIL_SMOKE_KEYWORD_LABEL", ""),
  after: env("GMAIL_SMOKE_KEYWORD_AFTER", ""),
  before: env("GMAIL_SMOKE_KEYWORD_BEFORE", ""),
  hasAttachment: envFlag("GMAIL_SMOKE_KEYWORD_HAS_ATTACHMENT"),
};
const semanticQuery = env("GMAIL_SMOKE_SEMANTIC_QUERY", keywordText);
const createIdea = env(
  "GMAIL_SMOKE_CREATE_IDEA",
  `Build a Create prompt using the staged Gmail evidence for ${semanticQuery}.`,
);
const createEvidenceNeedle = env("GMAIL_SMOKE_EXPECT_CREATE_TEXT", semanticQuery);
const minMessages = positiveInt(env("GMAIL_SMOKE_EXPECT_MIN_MESSAGES", "1"), 1);
const confirmMutations = envFlag("GMAIL_SMOKE_CONFIRM_MUTATIONS");
const confirmDelete = envFlag("GMAIL_SMOKE_CONFIRM_DELETE");
const evidenceFile = env("GMAIL_SMOKE_EVIDENCE_FILE", "");

const evidence = {
  baseUrl,
  userId,
  workspaceId,
  projectId,
  sphereId,
  destructiveRevokeEnabled: confirmMutations,
  destructiveDeleteEnabled: confirmDelete,
  startedAt: new Date().toISOString(),
  steps: [],
};

try {
  const selector = connectionSelector();
  const initialStatus = await request("GET", "/api/connectors/google/gmail/status");
  assert(initialStatus.data?.configured === true, "Gmail is not configured.");
  assert(
    Array.isArray(initialStatus.data?.scopes) &&
      initialStatus.data.scopes.includes("https://www.googleapis.com/auth/gmail.readonly"),
    "Gmail status did not report gmail.readonly.",
  );
  assert(initialStatus.data?.privacy?.trainingUse === false, "Gmail privacy did not report trainingUse=false.");
  assert((initialStatus.data?.connections ?? []).some((connection) => connection.status === "connected"), "Connect Gmail first.");
  const connectedTargets = (initialStatus.data?.connections ?? []).filter((connection) => connection.status === "connected");
  const targetedConnection = connectedTargets.find((connection) => matchesConnectionSelector(connection, selector));
  const selectorUsed = Object.keys(selector).length > 0;
  assert(selectorUsed || connectedTargets.length <= 1, "Multiple Gmail connections found. Set GMAIL_SMOKE_CONNECTION_ID or GMAIL_SMOKE_PROVIDER_CONFIG_KEY.");
  assert(!selectorUsed || targetedConnection, "Configured Gmail smoke connection selector did not match a connected Gmail account.");
  const targetConnectorConnectionId = targetedConnection?.id ?? connectedTargets[0]?.id ?? null;
  record("status.initial", {
    status: initialStatus.data.status,
    messageCount: initialStatus.data.messageCount,
    connectionCount: initialStatus.data.connections.length,
    sourceCount: initialStatus.data.sources.length,
    selectorUsed,
    targetConnectionMatched: selectorUsed ? Boolean(targetedConnection) : null,
  });

  const syncInput = keywordSearchInput();
  const sync = await request("POST", "/api/connectors/google/gmail/sync", {
    ...selector,
    ...syncInput,
    maxResults,
  });
  assert(sync.data?.messageCount >= minMessages, `Expected at least ${minMessages} synced Gmail message(s).`);
  assert(sync.data?.partialFailureCount === 0, "Gmail sync reported partial failures.");
  assert(sync.data?.cursor || sync.data?.profile?.historyId, "Gmail sync did not report cursor/historyId.");
  record("sync", {
    messageCount: sync.data.messageCount,
    importedCount: sync.data.importedSources?.length ?? 0,
    partialFailureCount: sync.data.partialFailureCount ?? 0,
    cursorPresent: Boolean(sync.data.cursor),
    historyIdPresent: Boolean(sync.data.profile?.historyId),
    filtersUsed: compactObject(syncInput),
  });

  const statusAfterSync = await request("GET", "/api/connectors/google/gmail/status");
  assert(statusAfterSync.data?.messageCount >= minMessages, "Gmail status did not show synced message count.");
  let firstSource = statusAfterSync.data?.sources?.[0] ?? sync.data?.state?.sources?.[0] ?? null;
  let firstSourceId = firstSource?.id ?? "";
  let firstBrainSourceId = firstSource?.brainSourceId ?? "";
  let firstSourceUri = firstSource?.sourceUri ?? "";
  record("status.afterSync", {
    status: statusAfterSync.data.status,
    messageCount: statusAfterSync.data.messageCount,
    sourceCount: statusAfterSync.data.sources.length,
    firstSourceIdPresent: Boolean(firstSourceId),
  });

  const sourceUrisAfterSync = gmailSourceUris(statusAfterSync.data?.sources, targetConnectorConnectionId);
  assert(hasUniqueValues(sourceUrisAfterSync), "Gmail sync produced duplicate source refs.");
  const repeatSync = await request("POST", "/api/connectors/google/gmail/sync", {
    ...selector,
    ...syncInput,
    maxResults,
  });
  assert(repeatSync.data?.partialFailureCount === 0, "Repeated Gmail sync reported partial failures.");
  const statusAfterRepeatSync = await request("GET", "/api/connectors/google/gmail/status");
  const sourceUrisAfterRepeatSync = gmailSourceUris(statusAfterRepeatSync.data?.sources, targetConnectorConnectionId);
  assert(
    statusAfterRepeatSync.data?.messageCount === statusAfterSync.data.messageCount,
    "Repeated Gmail sync changed Gmail source count.",
  );
  assert(
    sourceUrisAfterRepeatSync.length === sourceUrisAfterSync.length,
    "Repeated Gmail sync changed selected account source count.",
  );
  assert(hasUniqueValues(sourceUrisAfterRepeatSync), "Repeated Gmail sync produced duplicate source refs.");
  record("sync.repeat", {
    messageCount: repeatSync.data.messageCount,
    partialFailureCount: repeatSync.data.partialFailureCount ?? 0,
    statusMessageCountUnchanged: statusAfterRepeatSync.data.messageCount === statusAfterSync.data.messageCount,
    selectedSourceCountUnchanged: sourceUrisAfterRepeatSync.length === sourceUrisAfterSync.length,
    duplicateSourceRefsAbsent: hasUniqueValues(sourceUrisAfterRepeatSync),
  });

  const beforeKeywordCount = statusAfterRepeatSync.data.messageCount;
  const keyword = await request("POST", "/api/connectors/google/gmail/search", {
    ...selector,
    ...keywordSearchInput(),
    maxResults,
  });
  assert(keyword.data?.stored === false, "Keyword search stored results without sync=true.");
  assert(Array.isArray(keyword.data?.results) && keyword.data.results.length > 0, "Keyword search returned no Gmail results.");
  assert(keyword.data.results.every(hasKeywordResultShape), "Keyword search returned an unexpected result shape.");
  const statusAfterKeyword = await request("GET", "/api/connectors/google/gmail/status");
  assert(statusAfterKeyword.data?.messageCount === beforeKeywordCount, "Keyword search changed Gmail memory count without sync=true.");
  record("keywordSearch", {
    query: keyword.data.query,
    stored: keyword.data.stored,
    filtersUsed: compactObject(keywordFilters),
    resultCount: keyword.data.results.length,
    memoryCountUnchanged: statusAfterKeyword.data.messageCount === beforeKeywordCount,
  });

  const semantic = await request("POST", "/api/connectors/google/gmail/semantic-search", {
    ...selector,
    query: semanticQuery,
    limit: maxResults,
  });
  assert(Array.isArray(semantic.data?.results) && semantic.data.results.length > 0, "Semantic Gmail search returned no synced memory.");
  assert(semantic.data.results.every(hasSemanticResultShape), "Semantic Gmail search returned an unexpected result shape.");
  assert(semantic.data.results.every((result) => !("score" in result)), "Semantic Gmail search exposed a raw score.");
  const semanticMatchedSource = (statusAfterSync.data?.sources ?? []).find((source) =>
    semantic.data.results.some((result) =>
      matchesDeletedSourceRef(result.sourceRef, {
        connectorSourceId: source.id ?? "",
        brainSourceId: source.brainSourceId ?? "",
        sourceUri: source.sourceUri ?? "",
      }),
    ),
  );
  if (semanticMatchedSource) {
    firstSource = semanticMatchedSource;
    firstSourceId = firstSource?.id ?? "";
    firstBrainSourceId = firstSource?.brainSourceId ?? "";
    firstSourceUri = firstSource?.sourceUri ?? "";
  }
  const deletedSourceRef = {
    connectorSourceId: firstSourceId,
    brainSourceId: firstBrainSourceId,
    sourceUri: firstSourceUri,
  };
  const deletedSemanticMemoryIds = new Set(
    semantic.data.results
      .filter((result) => matchesDeletedSourceRef(result.sourceRef, deletedSourceRef))
      .map((result) => result.memoryRef?.id)
      .filter(Boolean),
  );
  if (confirmMutations && confirmDelete) {
    assert(semanticMatchedSource, "Delete smoke could not match the delete target to a semantic Gmail result.");
    assert(deletedSemanticMemoryIds.size > 0, "Delete smoke found no tracked Gmail memory refs for the delete target.");
  }
  record("semanticSearch", {
    resultCount: semantic.data.results.length,
    contextLight: semantic.data.contextLight,
    rawScoreHidden: semantic.data.results.every((result) => !("score" in result)),
    deleteTargetMatchedSemanticResult: Boolean(semanticMatchedSource),
    deleteTargetMemoryIdCount: deletedSemanticMemoryIds.size,
  });

  const createFirst = await request("POST", "/api/create/next", {
    rawIdea: createIdea,
    projectId,
    sessionId: `gmail-smoke-session-${Date.now()}`,
  });
  assert(Array.isArray(createFirst.data?.optionSet?.options), "Create did not return options.");
  const createText = JSON.stringify(createFirst.data);
  assert(
    includesNeedle(createText, createEvidenceNeedle),
    "Create did not include expected Gmail evidence text.",
  );
  const selectedOptions = createFirst.data.optionSet.options
    .filter((option) => option.lens === "Personal" || option.lens === "Critical")
    .map((option) => option.id);
  assert(selectedOptions.length > 0, "Create did not return Personal/Critical options for refinement.");
  record("create.first", {
    memoryCountUsed: createFirst.data.observability?.memoryCountUsed ?? 0,
    sourceCountUsed: createFirst.data.observability?.sourceCountUsed ?? 0,
    selectedOptionCount: selectedOptions.length,
    expectedEvidencePresent: includesNeedle(createText, createEvidenceNeedle),
  });

  const createRefined = await request("POST", "/api/create/next", {
    rawIdea: createIdea,
    projectId: createFirst.data.optionSet.projectId,
    sessionId: createFirst.data.optionSet.sessionId,
    optionSetId: createFirst.data.optionSet.id,
    selectedOptionIds: selectedOptions,
    userComment: "Staging smoke: use the real Gmail evidence and keep privacy constraints explicit.",
    artifact: createFirst.data.artifact,
  });
  const exportResult = await request("POST", "/api/create/export-coding-prompt", {
    artifact: createRefined.data.artifact,
    verification: createRefined.data.verification,
    judgmentEvent: createRefined.data.judgmentEvent,
  });
  const exportText = exportResult.data?.export?.text ?? "";
  assert(includesNeedle(exportText, createEvidenceNeedle), "Export prompt did not include the expected Gmail-derived context.");
  assert(!/global training|hidden memory|private inbox/i.test(exportText), "Export prompt included an unsafe privacy claim.");
  record("create.export", {
    exportId: exportResult.data?.export?.id ?? null,
    expectedEvidencePresent: includesNeedle(exportText, createEvidenceNeedle),
    unsafePrivacyClaimAbsent: !/global training|hidden memory|private inbox/i.test(exportText),
  });

  if (confirmMutations) {
    const revoke = await request("POST", "/api/connectors/google/gmail/revoke", selector);
    assert(revoke.data?.revoked === true, "Gmail revoke did not report revoked=true.");
    const syncAfterRevoke = await requestMaybeFail("POST", "/api/connectors/google/gmail/sync", {
      ...selector,
      maxResults: 1,
    });
    const searchAfterRevoke = await requestMaybeFail("POST", "/api/connectors/google/gmail/search", {
      ...selector,
      text: keywordText,
      maxResults: 1,
    });
    const semanticAfterRevoke = await requestMaybeFail("POST", "/api/connectors/google/gmail/semantic-search", {
      ...selector,
      query: semanticQuery,
      limit: maxResults,
    });
    assert(syncAfterRevoke.status >= 400, "Gmail sync unexpectedly succeeded after revoke.");
    assert(searchAfterRevoke.status >= 400, "Gmail keyword search unexpectedly succeeded after revoke.");
    assert(semanticAfterRevoke.status >= 400, "Gmail semantic search unexpectedly succeeded after revoke.");
    record("revoke", {
      revoked: true,
      syncAfterRevokeStatus: syncAfterRevoke.status,
      searchAfterRevokeStatus: searchAfterRevoke.status,
      semanticAfterRevokeStatus: semanticAfterRevoke.status,
    });

    if (confirmDelete) {
      assert(firstSourceId, "No Gmail source id was available for delete smoke.");
      const deleted = await request("POST", "/api/connectors/google/source-delete", {
        sourceId: firstSourceId,
      });
      assert(deleted.data?.brainSourceDeleted === true, "Gmail source delete did not delete the Brain source.");
      const profileAfterDelete = await request("GET", "/api/brain/memory/profile");
      const deletedBrainSourceStillPresent = (profileAfterDelete.data?.sources ?? []).some(
        (source) => (firstBrainSourceId && source.id === firstBrainSourceId) || (firstSourceUri && source.sourceUri === firstSourceUri),
      );
      const semanticAfterDelete = await requestMaybeFail("POST", "/api/connectors/google/gmail/semantic-search", {
        ...selector,
        query: semanticQuery,
        limit: maxResults,
      });
      const semanticResultsAfterDelete = semanticAfterDelete.payload?.data?.results ?? [];
      const deletedSemanticResultStillPresent =
        Array.isArray(semanticResultsAfterDelete) &&
        semanticResultsAfterDelete.some(
          (result) => matchesDeletedSourceRef(result.sourceRef, deletedSourceRef),
        );
      const brainRetrieveAfterDelete = await request("POST", "/api/brain/retrieve", {
        query: semanticQuery,
        limit: maxResults,
      });
      const brainRetrieveResultsAfterDelete = brainRetrieveAfterDelete.data?.results ?? [];
      assert(Array.isArray(brainRetrieveResultsAfterDelete), "Brain retrieval after delete did not return results.");
      const deletedBrainRetrievalStillPresent = brainRetrieveResultsAfterDelete.some(
        (result) =>
          matchesDeletedSourceRef(result.sourceRef, deletedSourceRef) ||
          (firstBrainSourceId && result.sourceId === firstBrainSourceId) ||
          deletedSemanticMemoryIds.has(result.memoryRef?.id),
      );
      const createAfterDelete = await request("POST", "/api/create/next", {
        rawIdea: createIdea,
        projectId,
        sessionId: `gmail-smoke-after-delete-session-${Date.now()}`,
      });
      const createAfterDeleteOptionSet = createAfterDelete.data?.optionSet ?? {};
      assert(Array.isArray(createAfterDeleteOptionSet.sourcesUsed), "Create after delete did not return source refs.");
      assert(Array.isArray(createAfterDeleteOptionSet.memoryUsed), "Create after delete did not return memory refs.");
      const deletedCreateSourceStillPresent = createAfterDeleteOptionSet.sourcesUsed.some((source) =>
        matchesDeletedSourceRef(source, deletedSourceRef),
      );
      const deletedCreateMemoryStillPresent = createAfterDeleteOptionSet.memoryUsed.some((memory) =>
        deletedSemanticMemoryIds.has(memory.id),
      );

      assert(!deletedBrainSourceStillPresent, "Deleted Gmail source still appears in Brain profile.");
      assert(!deletedBrainRetrievalStillPresent, "Deleted Gmail source still appears in Brain retrieval.");
      assert(!deletedSemanticResultStillPresent, "Deleted Gmail source still appears in semantic search results.");
      assert(!deletedCreateSourceStillPresent, "Deleted Gmail source still appears in Create source refs.");
      assert(!deletedCreateMemoryStillPresent, "Deleted Gmail memory still appears in Create memory refs.");
      record("deleteSource", {
        sourceIdPresent: Boolean(firstSourceId),
        brainSourceIdPresent: Boolean(firstBrainSourceId),
        brainSourceDeleted: deleted.data.brainSourceDeleted,
        brainProfileSourceAbsent: !deletedBrainSourceStillPresent,
        brainRetrieveDeletedSourceAbsent: !deletedBrainRetrievalStillPresent,
        brainRetrieveAfterDeleteResultCount: brainRetrieveResultsAfterDelete.length,
        semanticAfterDeleteStatus: semanticAfterDelete.status,
        semanticDeletedSourceAbsent: !deletedSemanticResultStillPresent,
        createAfterDeleteMemoryCountUsed: createAfterDelete.data?.observability?.memoryCountUsed ?? 0,
        createAfterDeleteSourceCountUsed: createAfterDelete.data?.observability?.sourceCountUsed ?? 0,
        createDeletedSourceAbsent: !deletedCreateSourceStillPresent,
        createDeletedMemoryAbsent: !deletedCreateMemoryStillPresent,
        trackedDeletedMemoryIdCount: deletedSemanticMemoryIds.size,
      });
    }
  } else {
    record("revoke.delete.skipped", {
      reason: "Set GMAIL_SMOKE_CONFIRM_MUTATIONS=true to revoke and GMAIL_SMOKE_CONFIRM_DELETE=true to delete the staged source.",
      firstSourceIdPresent: Boolean(firstSourceId),
    });
  }

  evidence.completedAt = new Date().toISOString();
  await writeEvidence();
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  evidence.failedAt = new Date().toISOString();
  evidence.error = error instanceof Error ? error.message : String(error);
  await writeEvidence();
  console.error(JSON.stringify(evidence, null, 2));
  process.exitCode = 1;
}

function env(name, fallback) {
  const value = process.env[name];

  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function envFlag(name) {
  return /^(1|true|yes)$/i.test(env(name, ""));
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function connectionSelector() {
  return {
    ...(connectionId ? { connectionId } : {}),
    ...(providerConfigKey ? { providerConfigKey } : {}),
  };
}

function matchesConnectionSelector(connection, selector) {
  return Boolean(
    connection &&
      (!selector.connectionId || connection.id === selector.connectionId || connection.credential?.connectionId === selector.connectionId) &&
      (!selector.providerConfigKey || connection.credential?.providerConfigKey === selector.providerConfigKey),
  );
}

function keywordSearchInput() {
  return {
    ...(keywordText ? { text: keywordText } : {}),
    ...(keywordFilters.from ? { from: keywordFilters.from } : {}),
    ...(keywordFilters.to ? { to: keywordFilters.to } : {}),
    ...(keywordFilters.subject ? { subject: keywordFilters.subject } : {}),
    ...(keywordFilters.label ? { label: keywordFilters.label } : {}),
    ...(keywordFilters.after ? { after: keywordFilters.after } : {}),
    ...(keywordFilters.before ? { before: keywordFilters.before } : {}),
    ...(keywordFilters.hasAttachment ? { hasAttachment: true } : {}),
  };
}

async function request(method, path, body) {
  const response = await requestMaybeFail(method, path, body);

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${method} ${path} failed with ${response.status}${response.error?.code ? ` (${response.error.code})` : ""}.`);
  }

  return response.payload;
}

async function requestMaybeFail(method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: headers(body !== undefined),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const raw = await response.text();
  const payload = raw.trim() ? safeJson(raw) : {};

  return {
    status: response.status,
    payload,
    error: payload.error,
    rawLength: raw.length,
  };
}

function headers(hasBody) {
  return {
    ...(hasBody ? { "content-type": "application/json" } : {}),
    ...(apiToken ? { authorization: `Bearer ${apiToken}` } : {}),
    "x-user-id": userId,
    "x-workspace-id": workspaceId,
    "x-project-id": projectId,
    "x-sphere-id": sphereId,
  };
}

function safeJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return { nonJson: true, rawLength: raw.length };
  }
}

function hasKeywordResultShape(result) {
  return Boolean(
    result &&
      typeof result.messageId === "string" &&
      (result.threadId === null || typeof result.threadId === "string") &&
      typeof result.subject === "string" &&
      typeof result.sender === "string" &&
      (result.date === null || typeof result.date === "string") &&
      typeof result.snippet === "string" &&
      result.sourceRef?.surface === "google_gmail" &&
      typeof result.sourceRef?.sourceUri === "string" &&
      hasNoRawEmailFields(result),
  );
}

function hasSemanticResultShape(result) {
  return Boolean(
    result &&
      typeof result.subject === "string" &&
      typeof result.sender === "string" &&
      (result.date === null || typeof result.date === "string") &&
      typeof result.snippet === "string" &&
      typeof result.messageId === "string" &&
      (result.threadId === null || typeof result.threadId === "string") &&
      result.sourceRef?.surface === "google_gmail" &&
      typeof result.sourceRef?.sourceUri === "string" &&
      result.memoryRef?.id &&
      (result.grounding === "grounded" || result.grounding === "inferred") &&
      typeof result.scoreReason === "string" &&
      hasNoRawEmailFields(result),
  );
}

function hasNoRawEmailFields(result) {
  return !["body", "plainTextBody", "raw", "rawBody", "html", "payload", "score"].some((field) => field in result);
}

function gmailSourceUris(sources, connectionId) {
  return (Array.isArray(sources) ? sources : [])
    .filter((source) => !connectionId || source?.connectionId === connectionId)
    .map((source) => source?.sourceUri)
    .filter((sourceUri) => typeof sourceUri === "string" && sourceUri.startsWith("gmail:"));
}

function hasUniqueValues(values) {
  return new Set(values).size === values.length;
}

function includesNeedle(value, needle) {
  return value.toLowerCase().includes(needle.toLowerCase());
}

function matchesDeletedSourceRef(sourceRef, deletedSourceRef) {
  return Boolean(
    sourceRef &&
      ((deletedSourceRef.connectorSourceId && sourceRef.id === deletedSourceRef.connectorSourceId) ||
        (deletedSourceRef.brainSourceId && sourceRef.id === deletedSourceRef.brainSourceId) ||
        (deletedSourceRef.sourceUri && sourceRef.sourceUri === deletedSourceRef.sourceUri) ||
        (deletedSourceRef.sourceUri && sourceRef.url === deletedSourceRef.sourceUri)),
  );
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => Boolean(item)));
}

function record(step, data) {
  evidence.steps.push({
    step,
    at: new Date().toISOString(),
    ...data,
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function writeEvidence() {
  if (!evidenceFile) {
    return;
  }

  const { dirname } = await import("node:path");
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(dirname(evidenceFile), { recursive: true });
  await writeFile(evidenceFile, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
}
