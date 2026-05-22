#!/usr/bin/env node

const baseUrl = env("BASE_URL", "http://localhost:3000").replace(/\/+$/, "");
const gmailReadonlyScope = "https://www.googleapis.com/auth/gmail.readonly";
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
const expectedPartialFailureStage = env("GMAIL_SMOKE_EXPECT_PARTIAL_FAILURE_STAGE", "");
const connectPreflightOnly = envFlag("GMAIL_SMOKE_CONNECT_PREFLIGHT_ONLY");
const connectPreflight = envFlag("GMAIL_SMOKE_CONNECT_PREFLIGHT") || connectPreflightOnly;
const confirmMutations = envFlag("GMAIL_SMOKE_CONFIRM_MUTATIONS");
const confirmDelete = envFlag("GMAIL_SMOKE_CONFIRM_DELETE");
const stagingRunId = env("GMAIL_STAGING_RUN_ID", env("GMAIL_SMOKE_STAGING_RUN_ID", ""));
const evidenceFile = env("GMAIL_SMOKE_EVIDENCE_FILE", "");
const safeStagingRunIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/;

const evidence = {
  baseUrl,
  userId,
  workspaceId,
  projectId,
  sphereId,
  ...stagingRunIdEvidence(),
  connectPreflightEnabled: connectPreflight,
  connectPreflightOnly,
  destructiveRevokeEnabled: confirmMutations,
  destructiveDeleteEnabled: confirmDelete,
  startedAt: new Date().toISOString(),
  steps: [],
};

try {
  assertSafeStagingRunId();
  const selector = connectionSelector();
  const initialStatus = await request("GET", "/api/connectors/google/gmail/status");
  assert(initialStatus.data?.configured === true, "Gmail is not configured.");
  assertGmailReadonlyOnly(initialStatus.data?.scopes, "Gmail status");
  assert(initialStatus.data?.restrictedScope === true, "Gmail status did not report restrictedScope=true.");
  assert(initialStatus.data?.gated === true, "Gmail status did not report gated=true.");
  assert(initialStatus.data?.private === true, "Gmail status did not report private=true.");
  assert(initialStatus.data?.privacy?.trainingUse === false, "Gmail privacy did not report trainingUse=false.");
  assert(initialStatus.data?.privacy?.rawRetentionDefault === false, "Gmail privacy did not report rawRetentionDefault=false.");
  assert(initialStatus.data?.privacy?.noHumanReview === true, "Gmail privacy did not report noHumanReview=true.");
  assertConnectorStatePrivacy(initialStatus.data, "Initial Gmail status");
  const initialProvider = await request("GET", "/api/connectors/google");
  assertConnectorStatePrivacy(initialProvider.data, "Initial Google provider state");
  if (connectPreflight) {
    const connect = await request("POST", "/api/connectors/google/gmail/connect", {});
    assertGmailConnectPreflight(connect.data);
    record("connect.preflight", {
      providerConfigKey: connect.data.providerConfigKey,
      connectLinkPresent: typeof connect.data.connectLink === "string" && connect.data.connectLink.length > 0,
      connectLinkHost: safeUrlHost(connect.data.connectLink),
      tokenPresent: typeof connect.data.token === "string" && connect.data.token.length > 0,
      expiresAtPresent: typeof connect.data.expiresAt === "string" && connect.data.expiresAt.length > 0,
      requestedSurfaceIds: connect.data.requestedSurfaceIds,
      requestableSurfaceIds: connect.data.requestableSurfaceIds,
      requestableScopeUrls: connect.data.requestableScopeUrls,
      restrictedScope: connect.data.restrictedScope,
      gated: connect.data.gated,
      private: connect.data.private,
      scopeAuditReason: connect.data.scopeAuditReason,
      warningsCount: Array.isArray(connect.data.warnings) ? connect.data.warnings.length : 0,
    });
    if (connectPreflightOnly) {
      record("connect.preflightOnly.completed", {
        reason: "Connect-session preflight completed without running post-OAuth Gmail smoke checks.",
      });
      evidence.completedAt = new Date().toISOString();
      await writeEvidence();
      console.log(JSON.stringify(evidence, null, 2));
      process.exit(0);
    }
  }
  assert((initialStatus.data?.connections ?? []).some((connection) => connection.status === "connected"), "Connect Gmail first.");
  const connectedTargets = (initialStatus.data?.connections ?? []).filter((connection) => connection.status === "connected");
  const targetedConnection = connectedTargets.find((connection) => matchesConnectionSelector(connection, selector));
  const selectorUsed = Object.keys(selector).length > 0;
  assert(selectorUsed || connectedTargets.length <= 1, "Multiple Gmail connections found. Set GMAIL_SMOKE_CONNECTION_ID or GMAIL_SMOKE_PROVIDER_CONFIG_KEY.");
  assert(!selectorUsed || targetedConnection, "Configured Gmail smoke connection selector did not match a connected Gmail account.");
  const targetConnection = targetedConnection ?? connectedTargets[0] ?? null;
  const targetCredential = targetConnection?.credential ?? {};
  const targetConnectorConnectionId = targetConnection?.id ?? null;
  const targetAccountAliasPresent = Boolean(
    targetCredential.accountLabel ||
      targetCredential.accountEmail ||
      targetCredential.accountId ||
      targetCredential.endUserId,
  );
  assert(targetConnectorConnectionId, "Gmail smoke could not identify the target Penny Gmail connection.");
  assert(targetCredential.connectionId, "Gmail smoke target did not expose a Nango connection id.");
  assert(targetCredential.providerConfigKey, "Gmail smoke target did not expose a Nango provider config key.");
  assert(targetAccountAliasPresent, "Gmail smoke target did not expose staged account alias metadata.");
  record("status.initial", {
    status: initialStatus.data.status,
    messageCount: initialStatus.data.messageCount,
    connectionCount: initialStatus.data.connections.length,
    sourceCount: initialStatus.data.sources.length,
    selectorUsed,
    targetConnectionMatched: selectorUsed ? Boolean(targetedConnection) : null,
    selectedAccountStateVisible: Boolean(targetConnection),
    targetConnectionIdPresent: Boolean(targetConnectorConnectionId),
    targetExternalConnectionIdPresent: Boolean(targetCredential.connectionId),
    targetProviderConfigKeyPresent: Boolean(targetCredential.providerConfigKey),
    targetAccountAliasPresent,
    restrictedScope: initialStatus.data.restrictedScope,
    gated: initialStatus.data.gated,
    private: initialStatus.data.private,
    rawRetentionDefault: initialStatus.data.privacy.rawRetentionDefault,
    noHumanReview: initialStatus.data.privacy.noHumanReview,
    statusStatePrivacySafe: true,
    providerStatePrivacySafe: true,
  });

  const syncInput = keywordSearchInput();
  const sync = await request("POST", "/api/connectors/google/gmail/sync", {
    ...selector,
    ...syncInput,
    maxResults,
  });
  assert(sync.data?.messageCount >= minMessages, `Expected at least ${minMessages} synced Gmail message(s).`);
  const syncPartialFailures = expectedPartialFailureCheck(sync.data, "Gmail sync");
  assert(syncPartialFailures.ok, syncPartialFailures.message);
  assert(sync.data?.cursor || sync.data?.profile?.historyId, "Gmail sync did not report cursor/historyId.");
  record("sync", {
    messageCount: sync.data.messageCount,
    importedCount: sync.data.importedSources?.length ?? 0,
    partialFailureCount: sync.data.partialFailureCount ?? 0,
    maxResultsUsed: maxResults,
    expectedPartialFailureStage: expectedPartialFailureStage || null,
    partialFailureStageMatched: syncPartialFailures.stageMatched,
    partialFailuresSanitized: syncPartialFailures.sanitized,
    cursorPresent: Boolean(sync.data.cursor),
    historyIdPresent: Boolean(sync.data.profile?.historyId),
    filtersUsed: compactObject(syncInput),
  });

  const statusAfterSync = await request("GET", "/api/connectors/google/gmail/status");
  assert(statusAfterSync.data?.messageCount >= minMessages, "Gmail status did not show synced message count.");
  assertConnectorStatePrivacy(statusAfterSync.data, "Gmail status after sync");
  const providerAfterSync = await request("GET", "/api/connectors/google");
  assertConnectorStatePrivacy(providerAfterSync.data, "Google provider state after sync");
  const selectedStatusSources = gmailSourcesForConnection(statusAfterSync.data?.sources, targetConnectorConnectionId);
  const selectedSyncSources = gmailSourcesForConnection(sync.data?.state?.sources, targetConnectorConnectionId);
  let firstSource = selectedStatusSources[0] ?? selectedSyncSources[0] ?? null;
  let firstSourceId = firstSource?.id ?? "";
  let firstBrainSourceId = firstSource?.brainSourceId ?? "";
  let firstSourceUri = firstSource?.sourceUri ?? "";
  const sourceUrisAfterSync = gmailSourceUris(selectedStatusSources, targetConnectorConnectionId);
  assert(sourceUrisAfterSync.length >= minMessages, "Gmail status did not expose selected-account synced source refs.");
  const syncedSourcePrivacy = connectorSourcePrivacySummary(sync.data?.state?.sources, targetConnectorConnectionId);
  assert(syncedSourcePrivacy.sourceCount >= minMessages, "Gmail sync did not expose synced source privacy evidence.");
  assert(syncedSourcePrivacy.trainingUseFalse, "Gmail sync source privacy did not report trainingUse=false.");
  assert(syncedSourcePrivacy.rawContentStoredFalse, "Gmail sync source privacy did not report rawContentStored=false.");
  assert(syncedSourcePrivacy.privateUserMemory, "Gmail sync source privacy did not report private user memory visibility.");
  assert(syncedSourcePrivacy.retrievalEnabled, "Gmail sync source privacy did not report retrieval access enabled.");
  const brainProfileAfterSync = await request("GET", "/api/brain/memory/profile");
  const brainProfilePrivacy = brainProfileSourcePrivacySummary(brainProfileAfterSync.data?.sources, sourceUrisAfterSync);
  assert(brainProfilePrivacy.sourceCount >= minMessages, "Brain profile did not expose synced Gmail source privacy evidence.");
  assert(brainProfilePrivacy.matchedSelectedSourceRefs, "Brain profile did not match the selected-account Gmail source refs.");
  assert(brainProfilePrivacy.trainingUseFalse, "Brain profile Gmail source privacy did not report trainingUse=false.");
  assert(brainProfilePrivacy.rawRetentionFalse, "Brain profile Gmail source privacy did not report rawRetention=false.");
  assert(brainProfilePrivacy.privateVisibility, "Brain profile Gmail source privacy did not report private visibility.");
  record("status.afterSync", {
    status: statusAfterSync.data.status,
    messageCount: statusAfterSync.data.messageCount,
    sourceCount: statusAfterSync.data.sources.length,
    firstSourceIdPresent: Boolean(firstSourceId),
    selectedSourceRefCount: sourceUrisAfterSync.length,
    statusStatePrivacySafe: true,
    providerStatePrivacySafe: true,
    syncedSourceCount: syncedSourcePrivacy.sourceCount,
    syncedSourceTrainingUseFalse: syncedSourcePrivacy.trainingUseFalse,
    syncedSourceRawContentStoredFalse: syncedSourcePrivacy.rawContentStoredFalse,
    syncedSourcePrivateUserMemory: syncedSourcePrivacy.privateUserMemory,
    syncedSourceRetrievalEnabled: syncedSourcePrivacy.retrievalEnabled,
    brainProfileGmailSourceCount: brainProfilePrivacy.sourceCount,
    brainProfileMatchedSelectedSourceRefs: brainProfilePrivacy.matchedSelectedSourceRefs,
    brainProfileTrainingUseFalse: brainProfilePrivacy.trainingUseFalse,
    brainProfileRawRetentionFalse: brainProfilePrivacy.rawRetentionFalse,
    brainProfilePrivateVisibility: brainProfilePrivacy.privateVisibility,
  });

  assert(hasUniqueValues(sourceUrisAfterSync), "Gmail sync produced duplicate source refs.");
  const repeatSync = await request("POST", "/api/connectors/google/gmail/sync", {
    ...selector,
    ...syncInput,
    maxResults,
  });
  const repeatPartialFailures = expectedPartialFailureCheck(repeatSync.data, "Repeated Gmail sync");
  assert(repeatPartialFailures.ok, repeatPartialFailures.message);
  assert(repeatSync.data?.cursor || repeatSync.data?.profile?.historyId, "Repeated Gmail sync did not report cursor/historyId.");
  const statusAfterRepeatSync = await request("GET", "/api/connectors/google/gmail/status");
  assertConnectorStatePrivacy(statusAfterRepeatSync.data, "Gmail status after repeated sync");
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
    maxResultsUsed: maxResults,
    expectedPartialFailureStage: expectedPartialFailureStage || null,
    partialFailureStageMatched: repeatPartialFailures.stageMatched,
    partialFailuresSanitized: repeatPartialFailures.sanitized,
    cursorPresent: Boolean(repeatSync.data.cursor),
    historyIdPresent: Boolean(repeatSync.data.profile?.historyId),
    filtersUsed: compactObject(syncInput),
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
  const keywordResultShapeVerified = keyword.data.results.every(hasKeywordResultShape);
  const keywordSelectedSourceRefsMatched = resultsMatchSelectedSourceRefs(keyword.data.results, sourceUrisAfterSync);
  assert(keywordResultShapeVerified, "Keyword search returned an unexpected result shape.");
  assert(keywordSelectedSourceRefsMatched, "Keyword search results did not match selected-account Gmail source refs.");
  const statusAfterKeyword = await request("GET", "/api/connectors/google/gmail/status");
  assertConnectorStatePrivacy(statusAfterKeyword.data, "Gmail status after keyword search");
  assert(statusAfterKeyword.data?.messageCount === beforeKeywordCount, "Keyword search changed Gmail memory count without sync=true.");
  record("keywordSearch", {
    query: keyword.data.query,
    stored: keyword.data.stored,
    filtersUsed: compactObject(keywordFilters),
    maxResultsUsed: maxResults,
    resultCount: keyword.data.results.length,
    resultShapeVerified: keywordResultShapeVerified,
    messageRefPresent: keyword.data.results.every(hasKeywordMessageRef),
    threadRefPresent: keyword.data.results.every(hasKeywordThreadRef),
    sourceRefPresent: keyword.data.results.every(hasKeywordSourceRef),
    selectedSourceRefsMatched: keywordSelectedSourceRefsMatched,
    snippetPresent: keyword.data.results.every(hasKeywordSnippet),
    rawBodyAbsent: keyword.data.results.every(hasNoRawEmailFields),
    memoryCountUnchanged: statusAfterKeyword.data.messageCount === beforeKeywordCount,
  });

  const beforeKeywordSyncCount = statusAfterKeyword.data.messageCount;
  const keywordSync = await request("POST", "/api/connectors/google/gmail/search", {
    ...selector,
    ...keywordSearchInput(),
    maxResults,
    sync: true,
  });
  assert(keywordSync.data?.stored === true, "Keyword search with sync=true did not report stored=true.");
  assert(Array.isArray(keywordSync.data?.results) && keywordSync.data.results.length > 0, "Keyword search with sync=true returned no Gmail results.");
  const keywordSyncResultShapeVerified = keywordSync.data.results.every(hasKeywordResultShape);
  const keywordSyncSelectedSourceRefsMatched = resultsMatchSelectedSourceRefs(keywordSync.data.results, sourceUrisAfterSync);
  assert(keywordSyncResultShapeVerified, "Keyword search with sync=true returned an unexpected result shape.");
  assert(keywordSyncSelectedSourceRefsMatched, "Keyword search with sync=true results did not match selected-account Gmail source refs.");
  assert(keywordSync.data?.sync?.partialFailureCount === 0, "Keyword search with sync=true reported partial sync failures.");
  const statusAfterKeywordSync = await request("GET", "/api/connectors/google/gmail/status");
  assertConnectorStatePrivacy(statusAfterKeywordSync.data, "Gmail status after keyword search sync");
  const sourceUrisAfterKeywordSync = gmailSourceUris(statusAfterKeywordSync.data?.sources, targetConnectorConnectionId);
  assert(
    statusAfterKeywordSync.data?.messageCount === beforeKeywordSyncCount,
    "Keyword search with sync=true changed already synced Gmail source count.",
  );
  assert(hasUniqueValues(sourceUrisAfterKeywordSync), "Keyword search with sync=true produced duplicate source refs.");
  record("keywordSearch.syncExplicit", {
    query: keywordSync.data.query,
    stored: keywordSync.data.stored,
    filtersUsed: compactObject(keywordFilters),
    maxResultsUsed: maxResults,
    resultCount: keywordSync.data.results.length,
    resultShapeVerified: keywordSyncResultShapeVerified,
    messageRefPresent: keywordSync.data.results.every(hasKeywordMessageRef),
    threadRefPresent: keywordSync.data.results.every(hasKeywordThreadRef),
    sourceRefPresent: keywordSync.data.results.every(hasKeywordSourceRef),
    selectedSourceRefsMatched: keywordSyncSelectedSourceRefsMatched,
    snippetPresent: keywordSync.data.results.every(hasKeywordSnippet),
    rawBodyAbsent: keywordSync.data.results.every(hasNoRawEmailFields),
    partialFailureCount: keywordSync.data.sync?.partialFailureCount ?? null,
    statusMessageCountUnchanged: statusAfterKeywordSync.data.messageCount === beforeKeywordSyncCount,
    duplicateSourceRefsAbsent: hasUniqueValues(sourceUrisAfterKeywordSync),
  });

  const semantic = await request("POST", "/api/connectors/google/gmail/semantic-search", {
    ...selector,
    query: semanticQuery,
    limit: maxResults,
  });
  assert(Array.isArray(semantic.data?.results) && semantic.data.results.length > 0, "Semantic Gmail search returned no synced memory.");
  const semanticResultShapeVerified = semantic.data.results.every(hasSemanticResultShape);
  const semanticRawScoreHidden = semantic.data.results.every((result) => !("score" in result));
  const semanticSelectedSourceRefsMatched = resultsMatchSelectedSourceRefs(semantic.data.results, sourceUrisAfterSync);
  assert(semanticResultShapeVerified, "Semantic Gmail search returned an unexpected result shape.");
  assert(semanticRawScoreHidden, "Semantic Gmail search exposed a raw score.");
  assert(semanticSelectedSourceRefsMatched, "Semantic Gmail search results did not match selected-account Gmail source refs.");
  const semanticMatchedSource = selectedStatusSources.find((source) =>
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
    resultShapeVerified: semanticResultShapeVerified,
    subjectPresent: semantic.data.results.every(hasSemanticSubject),
    senderPresent: semantic.data.results.every(hasSemanticSender),
    dateFieldPresent: semantic.data.results.every(hasSemanticDateField),
    messageRefPresent: semantic.data.results.every(hasSemanticMessageRef),
    threadRefPresent: semantic.data.results.every(hasSemanticThreadRef),
    snippetPresent: semantic.data.results.every(hasSemanticSnippet),
    sourceRefPresent: semantic.data.results.every(hasSemanticSourceRef),
    selectedSourceRefsMatched: semanticSelectedSourceRefsMatched,
    memoryRefPresent: semantic.data.results.every(hasSemanticMemoryRef),
    scoreReasonPresent: semantic.data.results.every(hasSemanticScoreReason),
    groundingLabels: [...new Set(semantic.data.results.map((result) => result.grounding))].sort(),
    rawScoreHidden: semanticRawScoreHidden,
    rawBodyAbsent: semantic.data.results.every(hasNoRawEmailFields),
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
  const createOptionLenses = createFirst.data.optionSet.options.map((option) => option.lens).filter(Boolean).sort();
  const personalOptionPresent = createOptionLenses.includes("Personal");
  const criticalOptionPresent = createOptionLenses.includes("Critical");
  const gmailMemoryEvidencePresent = hasCreateMemoryEvidence(createFirst.data, createEvidenceNeedle);
  const gmailSourceEvidencePresent = hasCreateSourceEvidence(createFirst.data, createEvidenceNeedle);
  const rankedCandidateCount = Array.isArray(createFirst.data?.optionSet?.rankedCandidates)
    ? createFirst.data.optionSet.rankedCandidates.length
    : 0;
  const nextBestMoveGrounded = createFirst.data?.optionSet?.nextBestMove?.grounded === true;
  const rankedCandidateGmailMemoryEvidencePresent = hasRankedCandidateMemoryEvidence(createFirst.data, createEvidenceNeedle);
  const rankedCandidateGmailSourceEvidencePresent = hasRankedCandidateSourceEvidence(createFirst.data, createEvidenceNeedle);
  const personalOptionExpectedEvidencePresent = createLensExpectedEvidencePresent(createFirst.data, "Personal", createEvidenceNeedle);
  const criticalOptionExpectedEvidencePresent = createLensExpectedEvidencePresent(createFirst.data, "Critical", createEvidenceNeedle);
  assert(personalOptionPresent, "Create did not return a Personal option for Gmail evidence.");
  assert(criticalOptionPresent, "Create did not return a Critical option for Gmail evidence.");
  assert(gmailMemoryEvidencePresent, "Create did not include expected Gmail evidence in memory refs.");
  assert(gmailSourceEvidencePresent, "Create did not include expected Gmail evidence in source refs.");
  assert(rankedCandidateCount >= 5, "Create did not expose the five Brain Ranker candidates.");
  assert(nextBestMoveGrounded, "Create Brain Ranker next-best move was not grounded after Gmail sync.");
  assert(rankedCandidateGmailMemoryEvidencePresent, "Create Brain Ranker candidates did not include expected Gmail memory evidence.");
  assert(rankedCandidateGmailSourceEvidencePresent, "Create Brain Ranker candidates did not include expected Gmail source evidence.");
  assert(personalOptionExpectedEvidencePresent, "Create Personal option did not include expected Gmail evidence text.");
  assert(criticalOptionExpectedEvidencePresent, "Create Critical option did not include expected Gmail evidence text.");
  const selectedOptionRecords = createFirst.data.optionSet.options.filter((option) => option.lens === "Personal" || option.lens === "Critical");
  const selectedOptions = selectedOptionRecords.map((option) => option.id);
  const selectedLenses = [...new Set(selectedOptionRecords.map((option) => option.lens))].sort();
  record("create.first", {
    memoryCountUsed: createFirst.data.observability?.memoryCountUsed ?? 0,
    sourceCountUsed: createFirst.data.observability?.sourceCountUsed ?? 0,
    selectedOptionCount: selectedOptions.length,
    selectedLenses,
    personalOptionPresent,
    criticalOptionPresent,
    gmailMemoryEvidencePresent,
    gmailSourceEvidencePresent,
    rankedCandidateCount,
    nextBestMoveGrounded,
    rankedCandidateGmailMemoryEvidencePresent,
    rankedCandidateGmailSourceEvidencePresent,
    personalOptionExpectedEvidencePresent,
    criticalOptionExpectedEvidencePresent,
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
  const createRefinedText = JSON.stringify(createRefined.data);
  const refinedGmailMemoryEvidencePresent = hasCreateMemoryEvidence(createRefined.data, createEvidenceNeedle);
  const refinedGmailSourceEvidencePresent = hasCreateSourceEvidence(createRefined.data, createEvidenceNeedle);
  const refinedSelectedOptionsMatched = sameStringSet(createRefined.data?.judgmentEvent?.selectedOptionIds, selectedOptions);
  const refinedArtifactExpectedEvidencePresent = includesNeedle(JSON.stringify(createRefined.data?.artifact ?? {}), createEvidenceNeedle);
  const refinedPrivacySafety = inspectExportPrivacySafety(createRefinedText);
  assert(createRefined.data?.artifact, "Create refinement did not return an artifact.");
  assert(createRefined.data?.verification, "Create refinement did not return verification.");
  assert(createRefined.data?.judgmentEvent, "Create refinement did not return a judgment event.");
  assert(refinedSelectedOptionsMatched, "Create refinement did not preserve the selected Gmail option ids.");
  assert(includesNeedle(createRefinedText, createEvidenceNeedle), "Create refinement did not include expected Gmail evidence text.");
  assert(refinedGmailMemoryEvidencePresent, "Create refinement did not include expected Gmail evidence in memory refs.");
  assert(refinedGmailSourceEvidencePresent, "Create refinement did not include expected Gmail evidence in source refs.");
  assert(refinedArtifactExpectedEvidencePresent, "Create refinement artifact did not include expected Gmail evidence text.");
  assert(
    refinedPrivacySafety.safe,
    `Create refinement included unsafe Gmail privacy content: ${refinedPrivacySafety.failedChecks.join(", ")}.`,
  );
  record("create.refined", {
    artifactPresent: Boolean(createRefined.data?.artifact),
    verificationPresent: Boolean(createRefined.data?.verification),
    judgmentEventPresent: Boolean(createRefined.data?.judgmentEvent),
    selectedOptionCount: selectedOptions.length,
    selectedLenses,
    selectedOptionsMatched: refinedSelectedOptionsMatched,
    gmailMemoryEvidencePresent: refinedGmailMemoryEvidencePresent,
    gmailSourceEvidencePresent: refinedGmailSourceEvidencePresent,
    expectedEvidencePresent: includesNeedle(createRefinedText, createEvidenceNeedle),
    artifactExpectedEvidencePresent: refinedArtifactExpectedEvidencePresent,
    rawEmailBodyAbsent: refinedPrivacySafety.rawEmailBodyAbsent,
    secretOrConnectTokenAbsent: refinedPrivacySafety.secretOrConnectTokenAbsent,
    unsupportedHumanReviewClaimAbsent: refinedPrivacySafety.unsupportedHumanReviewClaimAbsent,
  });
  const exportResult = await request("POST", "/api/create/export-coding-prompt", {
    artifact: createRefined.data.artifact,
    verification: createRefined.data.verification,
    judgmentEvent: createRefined.data.judgmentEvent,
  });
  const exportText = exportResult.data?.export?.text ?? "";
  const exportPrivacySafety = inspectExportPrivacySafety(exportText);
  assert(includesNeedle(exportText, createEvidenceNeedle), "Export prompt did not include the expected Gmail-derived context.");
  assert(
    exportPrivacySafety.safe,
    `Export prompt included unsafe Gmail privacy content: ${exportPrivacySafety.failedChecks.join(", ")}.`,
  );
  record("create.export", {
    exportId: exportResult.data?.export?.id ?? null,
    expectedEvidencePresent: includesNeedle(exportText, createEvidenceNeedle),
    unsafePrivacyClaimAbsent: exportPrivacySafety.unsafePrivacyClaimAbsent,
    rawEmailBodyAbsent: exportPrivacySafety.rawEmailBodyAbsent,
    secretOrConnectTokenAbsent: exportPrivacySafety.secretOrConnectTokenAbsent,
    unsupportedHumanReviewClaimAbsent: exportPrivacySafety.unsupportedHumanReviewClaimAbsent,
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
      const createAfterDeleteRankedCandidateCount = Array.isArray(createAfterDeleteOptionSet.rankedCandidates)
        ? createAfterDeleteOptionSet.rankedCandidates.length
        : 0;
      const deletedCreateSourceStillPresent = createAfterDeleteOptionSet.sourcesUsed.some((source) =>
        matchesDeletedSourceRef(source, deletedSourceRef),
      );
      const deletedCreateMemoryStillPresent = createAfterDeleteOptionSet.memoryUsed.some((memory) =>
        deletedSemanticMemoryIds.has(memory.id),
      );
      const deletedCreateRankedCandidateSourceStillPresent = createRankedCandidateSourceRefs(createAfterDelete.data).some((source) =>
        matchesDeletedSourceRef(source, deletedSourceRef),
      );
      const deletedCreateRankedCandidateMemoryStillPresent = createRankedCandidateMemoryRefs(createAfterDelete.data).some((memory) =>
        deletedSemanticMemoryIds.has(memory.id),
      );

      assert(!deletedBrainSourceStillPresent, "Deleted Gmail source still appears in Brain profile.");
      assert(!deletedBrainRetrievalStillPresent, "Deleted Gmail source still appears in Brain retrieval.");
      assert(!deletedSemanticResultStillPresent, "Deleted Gmail source still appears in semantic search results.");
      assert(!deletedCreateSourceStillPresent, "Deleted Gmail source still appears in Create source refs.");
      assert(!deletedCreateMemoryStillPresent, "Deleted Gmail memory still appears in Create memory refs.");
      assert(createAfterDeleteRankedCandidateCount >= 5, "Create after delete did not expose Brain Ranker candidates.");
      assert(!deletedCreateRankedCandidateSourceStillPresent, "Deleted Gmail source still appears in Create ranked candidates.");
      assert(!deletedCreateRankedCandidateMemoryStillPresent, "Deleted Gmail memory still appears in Create ranked candidates.");
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
        createAfterDeleteRankedCandidateCount,
        createDeletedSourceAbsent: !deletedCreateSourceStillPresent,
        createDeletedMemoryAbsent: !deletedCreateMemoryStillPresent,
        createRankedCandidateDeletedSourceAbsent: !deletedCreateRankedCandidateSourceStillPresent,
        createRankedCandidateDeletedMemoryAbsent: !deletedCreateRankedCandidateMemoryStillPresent,
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

function hasKeywordMessageRef(result) {
  return typeof result?.messageId === "string" && result.messageId.length > 0;
}

function hasKeywordThreadRef(result) {
  return typeof result?.threadId === "string" && result.threadId.length > 0;
}

function hasKeywordSourceRef(result) {
  return Boolean(
    result?.sourceRef?.surface === "google_gmail" &&
      typeof result.sourceRef?.sourceUri === "string" &&
      result.sourceRef.sourceUri.length > 0,
  );
}

function hasKeywordSnippet(result) {
  return typeof result?.snippet === "string" && result.snippet.length > 0;
}

function resultsMatchSelectedSourceRefs(results, sourceUris) {
  const selected = new Set((Array.isArray(sourceUris) ? sourceUris : []).filter(Boolean));

  return selected.size > 0 && Array.isArray(results) && results.length > 0 && results.every((result) => {
    const sourceUri = result?.sourceRef?.sourceUri ?? result?.sourceRef?.url;

    return typeof sourceUri === "string" && selected.has(sourceUri);
  });
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

function hasSemanticSourceRef(result) {
  return Boolean(
    result?.sourceRef?.surface === "google_gmail" &&
      typeof result.sourceRef?.sourceUri === "string" &&
      result.sourceRef.sourceUri.length > 0,
  );
}

function hasSemanticMemoryRef(result) {
  return typeof result?.memoryRef?.id === "string" && result.memoryRef.id.length > 0;
}

function hasSemanticSubject(result) {
  return typeof result?.subject === "string" && result.subject.length > 0;
}

function hasSemanticSender(result) {
  return typeof result?.sender === "string" && result.sender.length > 0;
}

function hasSemanticDateField(result) {
  return Object.hasOwn(result ?? {}, "date") && (result.date === null || typeof result.date === "string");
}

function hasSemanticMessageRef(result) {
  return typeof result?.messageId === "string" && result.messageId.length > 0;
}

function hasSemanticThreadRef(result) {
  return typeof result?.threadId === "string" && result.threadId.length > 0;
}

function hasSemanticSnippet(result) {
  return typeof result?.snippet === "string" && result.snippet.length > 0;
}

function hasSemanticScoreReason(result) {
  return typeof result?.scoreReason === "string" && result.scoreReason.trim().length > 0;
}

function hasCreateMemoryEvidence(data, needle) {
  return createMemoryRefs(data).some((memory) => includesNeedle(`${memory.label ?? ""} ${memory.summary ?? ""} ${memory.id ?? ""}`, needle));
}

function hasCreateSourceEvidence(data, needle) {
  return createSourceRefs(data).some((source) =>
    includesNeedle(`${source.label ?? ""} ${source.excerpt ?? ""} ${source.sourceRange ?? ""} ${source.url ?? ""} ${source.id ?? ""}`, needle),
  );
}

function createLensExpectedEvidencePresent(data, lens, needle) {
  const options = Array.isArray(data?.optionSet?.options) ? data.optionSet.options : [];
  const option = options.find((candidate) => candidate?.lens === lens);

  return includesNeedle(JSON.stringify(option ?? {}), needle);
}

function hasRankedCandidateMemoryEvidence(data, needle) {
  return createRankedCandidateMemoryRefs(data).some((memory) =>
    includesNeedle(`${memory.label ?? ""} ${memory.title ?? ""} ${memory.summary ?? ""} ${memory.text ?? ""} ${memory.id ?? ""}`, needle),
  );
}

function hasRankedCandidateSourceEvidence(data, needle) {
  return createRankedCandidateSourceRefs(data).some((source) =>
    includesNeedle(
      `${source.label ?? ""} ${source.excerpt ?? ""} ${source.sourceRange ?? ""} ${source.url ?? ""} ${source.id ?? ""} ${source.sourceUri ?? ""}`,
      needle,
    ),
  );
}

function createMemoryRefs(data) {
  const optionSet = data?.optionSet ?? {};
  const optionMemories = Array.isArray(optionSet.options) ? optionSet.options.flatMap((option) => (Array.isArray(option.memoryUsed) ? option.memoryUsed : [])) : [];

  return [...(Array.isArray(optionSet.memoryUsed) ? optionSet.memoryUsed : []), ...optionMemories];
}

function createRankedCandidateMemoryRefs(data) {
  const rankedCandidates = Array.isArray(data?.optionSet?.rankedCandidates) ? data.optionSet.rankedCandidates : [];

  return rankedCandidates.flatMap((candidate) => (Array.isArray(candidate?.memoryRefs) ? candidate.memoryRefs : []));
}

function createRankedCandidateSourceRefs(data) {
  const rankedCandidates = Array.isArray(data?.optionSet?.rankedCandidates) ? data.optionSet.rankedCandidates : [];

  return rankedCandidates.flatMap((candidate) =>
    (Array.isArray(candidate?.sourceReferences) ? candidate.sourceReferences : []).flatMap((reference) => [
      reference,
      reference?.sourceNode,
      reference?.chunk,
    ]),
  );
}

function createSourceRefs(data) {
  const optionSet = data?.optionSet ?? {};
  const optionSources = Array.isArray(optionSet.options) ? optionSet.options.flatMap((option) => (Array.isArray(option.sourcesUsed) ? option.sourcesUsed : [])) : [];

  return [...(Array.isArray(optionSet.sourcesUsed) ? optionSet.sourcesUsed : []), ...optionSources];
}

function hasNoRawEmailFields(result) {
  return !["body", "plainTextBody", "raw", "rawBody", "html", "payload", "score"].some((field) => field in result);
}

function expectedPartialFailureCheck(data, label) {
  const count = typeof data?.partialFailureCount === "number" ? data.partialFailureCount : 0;
  const failures = Array.isArray(data?.partialFailures) ? data.partialFailures : [];

  if (!expectedPartialFailureStage) {
    return {
      ok: count === 0,
      message: `${label} reported partial failures.`,
      stageMatched: null,
      sanitized: true,
    };
  }

  const stageMatched = failures.some((failure) => failure?.stage === expectedPartialFailureStage);
  const sanitized = failures.every(hasSafePartialFailureShape);

  return {
    ok: count >= 1 && stageMatched && sanitized,
    message: `${label} did not report a sanitized ${expectedPartialFailureStage} partial failure.`,
    stageMatched,
    sanitized,
  };
}

function hasSafePartialFailureShape(failure) {
  return Boolean(
    failure &&
      typeof failure.stage === "string" &&
      typeof failure.retryable === "boolean" &&
      (failure.status === null || typeof failure.status === "number") &&
      typeof failure.errorCode === "string" &&
      typeof failure.message === "string" &&
      hasNoRawEmailFields(failure),
  );
}

function assertGmailConnectPreflight(data) {
  assert(data?.providerConfigKey, "Gmail connect preflight did not return a providerConfigKey.");
  assert(typeof data?.connectLink === "string" && data.connectLink.length > 0, "Gmail connect preflight did not return a connectLink.");
  assert(typeof data?.token === "string" && data.token.length > 0, "Gmail connect preflight did not return a session token.");
  assert(typeof data?.expiresAt === "string" && data.expiresAt.length > 0, "Gmail connect preflight did not return expiresAt.");
  assertGmailReadonlyOnly(data?.requestableScopeUrls, "Gmail connect preflight");
  assert(
    Array.isArray(data?.requestedSurfaceIds) && data.requestedSurfaceIds.includes("google_gmail"),
    "Gmail connect preflight did not request google_gmail.",
  );
  assert(
    Array.isArray(data?.requestableSurfaceIds) && data.requestableSurfaceIds.includes("google_gmail"),
    "Gmail connect preflight did not report google_gmail as requestable.",
  );
  assert(data?.restrictedScope === true, "Gmail connect preflight did not report restrictedScope=true.");
  assert(data?.gated === true, "Gmail connect preflight did not report gated=true.");
  assert(data?.private === true, "Gmail connect preflight did not report private=true.");
  assert(
    typeof data?.scopeAuditReason === "string" &&
      data.scopeAuditReason.includes("read email for private Brain memory and email search"),
    "Gmail connect preflight did not return the expected scope audit reason.",
  );
}

function assertGmailReadonlyOnly(scopes, label) {
  assert(Array.isArray(scopes), `${label} did not report Gmail scopes.`);
  assert(scopes.length === 1 && scopes[0] === gmailReadonlyScope, `${label} did not report exactly gmail.readonly.`);
}

function assertConnectorStatePrivacy(data, label) {
  const state = data?.state;

  assertNoUnsafeSourceFields(data?.sources, `${label}.sources`);
  assertNoUnsafeSourceFields(state?.sources, `${label}.state.sources`);
  assertNoUnsafeConnectionFields(data?.connections, `${label}.connections`);
  assertNoUnsafeConnectionFields(state?.connections, `${label}.state.connections`);
  assertNoUnsafeSyncJobFields(state?.syncJobs, `${label}.state.syncJobs`);

  for (const field of ["cursors", "audits"]) {
    assert(!(state && field in state), `${label}.state exposed ${field}.`);
  }
}

function assertNoUnsafeSourceFields(sources, label) {
  if (!Array.isArray(sources)) {
    return;
  }

  for (const source of sources) {
    for (const field of ["metadata", "provenance", "sourceRef", "scope", "trainingUse", "rawContentStored", "rawRetention", "brainNodeIds"]) {
      assert(!(field in source), `${label} exposed ${field}.`);
    }
    for (const field of ["trainingUse", "rawContentStored", "productionLogSafe", "visibility"]) {
      assert(!(field in (source.privacy ?? {})), `${label}.privacy exposed ${field}.`);
    }
    assert(hasNoRawEmailFields(source), `${label} exposed a raw email field.`);
  }
}

function assertNoUnsafeConnectionFields(connections, label) {
  if (!Array.isArray(connections)) {
    return;
  }

  for (const connection of connections) {
    const credential = connection?.credential ?? {};

    for (const field of ["credentialRef", "accessToken", "refreshToken", "token", "encryptedToken", "encryptedRefreshToken"]) {
      assert(!(field in credential), `${label}.credential exposed ${field}.`);
    }
  }
}

function assertNoUnsafeSyncJobFields(syncJobs, label) {
  if (!Array.isArray(syncJobs)) {
    return;
  }

  for (const job of syncJobs) {
    for (const field of ["cursorBefore", "cursorAfter", "sourceCounts", "error", "scope"]) {
      assert(!(field in job), `${label} exposed ${field}.`);
    }
  }
}

function gmailSourceUris(sources, connectionId) {
  return (Array.isArray(sources) ? sources : [])
    .filter((source) => !connectionId || source?.connectionId === connectionId)
    .map((source) => source?.sourceUri)
    .filter((sourceUri) => typeof sourceUri === "string" && sourceUri.startsWith("gmail:"));
}

function gmailSourcesForConnection(sources, connectionId) {
  return (Array.isArray(sources) ? sources : []).filter(
    (source) =>
      (!connectionId || source?.connectionId === connectionId) &&
      (source?.surface === "google_gmail" || source?.kind === "google_gmail_message" || String(source?.sourceUri ?? "").startsWith("gmail:")),
  );
}

function connectorSourcePrivacySummary(sources, connectionId) {
  const gmailSources = gmailSourcesForConnection(sources, connectionId);

  return {
    sourceCount: gmailSources.length,
    trainingUseFalse: gmailSources.length > 0 && gmailSources.every((source) => source?.privacy?.trainingUse === false),
    rawContentStoredFalse: gmailSources.length > 0 && gmailSources.every((source) => source?.privacy?.rawContentStored === false),
    privateUserMemory:
      gmailSources.length > 0 && gmailSources.every((source) => source?.privacy?.visibility === "private_user_memory"),
    retrievalEnabled: gmailSources.length > 0 && gmailSources.every((source) => source?.privacy?.retrievalAccess === "enabled"),
  };
}

function brainProfileSourcePrivacySummary(sources, sourceUris) {
  const sourceUriSet = new Set((Array.isArray(sourceUris) ? sourceUris : []).filter(Boolean));
  const gmailSources = (Array.isArray(sources) ? sources : []).filter((source) => {
    const sourceUri = source?.sourceUri;

    return typeof sourceUri === "string" && sourceUri.startsWith("gmail:") && sourceUriSet.has(sourceUri);
  });
  const matchedSelectedSourceRefs = sourceUriSet.size > 0 && [...sourceUriSet].every((sourceUri) =>
    gmailSources.some((source) => source.sourceUri === sourceUri),
  );

  return {
    sourceCount: gmailSources.length,
    matchedSelectedSourceRefs,
    trainingUseFalse: gmailSources.length > 0 && gmailSources.every((source) => source?.privacy?.trainingUse === false),
    rawRetentionFalse: gmailSources.length > 0 && gmailSources.every((source) => source?.privacy?.rawRetention === false),
    privateVisibility: gmailSources.length > 0 && gmailSources.every((source) => source?.privacy?.visibility === "private"),
  };
}

function hasUniqueValues(values) {
  return new Set(values).size === values.length;
}

function assertSafeStagingRunId() {
  if (!stagingRunId) {
    return;
  }

  assert(isSafeStagingRunId(stagingRunId), "GMAIL_STAGING_RUN_ID must be a safe opaque slug for Gmail staging smoke.");
}

function stagingRunIdEvidence() {
  return isSafeStagingRunId(stagingRunId) ? { stagingRunId: stagingRunId.trim() } : {};
}

function isSafeStagingRunId(value) {
  return typeof value === "string" && safeStagingRunIdPattern.test(value.trim());
}

function sameStringSet(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) {
    return false;
  }

  const normalizedLeft = left.filter((item) => typeof item === "string").sort();
  const normalizedRight = right.filter((item) => typeof item === "string").sort();

  return normalizedLeft.length === normalizedRight.length && normalizedLeft.every((item, index) => item === normalizedRight[index]);
}

function inspectExportPrivacySafety(text) {
  const unsafePrivacyClaimAbsent = !/global training|hidden memory|private inbox|background Gmail|before consent|unrestricted mailbox scan/i.test(text);
  const rawEmailBodyAbsent = !/plainTextBody|rawBody|Private Gmail body|raw email body|raw Gmail body/i.test(text);
  const secretOrConnectTokenAbsent = !/(https:\/\/connect\.[^\s"]+|session-token|gmail-session-token|ya29\.|refresh_token|NANGO_SECRET_KEY|PENNY_API_TOKEN)/i.test(text);
  const unsupportedHumanReviewClaimAbsent = !hasUnsupportedHumanReviewClaim(text);
  const checks = [
    ["unsafe privacy claims", unsafePrivacyClaimAbsent],
    ["raw Gmail body markers", rawEmailBodyAbsent],
    ["connect/session/token values", secretOrConnectTokenAbsent],
    ["unsupported human-review claims", unsupportedHumanReviewClaimAbsent],
  ];

  return {
    unsafePrivacyClaimAbsent,
    rawEmailBodyAbsent,
    secretOrConnectTokenAbsent,
    unsupportedHumanReviewClaimAbsent,
    safe: checks.every(([, passed]) => passed),
    failedChecks: checks.filter(([, passed]) => !passed).map(([label]) => label),
  };
}

function hasUnsupportedHumanReviewClaim(text) {
  return text
    .split(/[.!?\n;]/)
    .filter((segment) => /human review/i.test(segment))
    .some((segment) => !/\b(no|without|zero)\s+human review\b/i.test(segment));
}

function includesNeedle(value, needle) {
  return value.toLowerCase().includes(needle.toLowerCase());
}

function safeUrlHost(value) {
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
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
