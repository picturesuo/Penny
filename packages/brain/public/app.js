const $ = (selector) => document.querySelector(selector);

const elements = {
  artifactBrief: $("#artifactBrief"),
  artifactCreate: $("#artifactCreate"),
  artifactStatus: $("#artifactStatus"),
  claimDrawer: $("#claimDrawer"),
  claimDrawerBackdrop: $("#claimDrawerBackdrop"),
  claimDrawerClose: $("#claimDrawerClose"),
  claimDrawerContent: $("#claimDrawerContent"),
  claimDrawerTitle: $("#claimDrawerTitle"),
  currentClaim: $("#currentClaim"),
  explorationCount: $("#explorationCount"),
  explorationRows: $("#explorationRows"),
  failureType: $("#insightFailureType") ?? $("#failureType"),
  form: $("#seedForm"),
  formStatus: $("#formStatus"),
  keyInsight: $("#keyInsight"),
  laterCount: $("#laterCount"),
  laterList: $("#laterList"),
  learnCount: $("#learnCount"),
  learnList: $("#learnList"),
  mapCount: $("#mapCount"),
  pennyInsight: $("#pennyInsight"),
  quickSelect: $("#quickSelect"),
  rawIdea: $("#rawIdea"),
  responseOptions: $("#responseOptions"),
  seedSubmit: $("#seedSubmit"),
  sessionStatus: $("#sessionStatus"),
  sourceKind: $("#sourceKind"),
  thoughtMap: $("#thoughtMap"),
  thinkingIndicator: $("#thinkingIndicator"),
  verifyResult: $("#verifyResult"),
  verifyStatus: $("#verifyStatus"),
  weakestPart: $("#insightTarget") ?? $("#weakestPart"),
  challengeText: $("#insightChallenge") ?? $("#challengeText"),
};

const state = {
  data: null,
  respondingClaimId: null,
  challengingClaimId: null,
  respondingChallengeId: null,
  activeChallenge: null,
  activeLearn: null,
  learning: false,
  savingLearn: false,
  artifactCreating: false,
  activeArtifact: null,
  activeVerify: null,
  verifyingClaimId: null,
  activeClaimDetail: null,
  loadingClaimDetailId: null,
};

renderEmptyState();

elements.form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const rawIdea = elements.rawIdea?.value.trim() ?? "";

  if (!rawIdea) {
    setStatus("What's on your mind?", true);
    elements.rawIdea?.focus();
    return;
  }

  setLoading(true);
  let settledRunLabel = null;

  try {
    const payload = await seedBrain(rawIdea);
    state.data = payload.data;
    state.activeChallenge = null;
    state.activeLearn = null;
    state.activeArtifact = null;
    state.activeVerify = null;
    state.activeClaimDetail = null;
    closeClaimDrawer();
    renderCockpit(payload.data);
    setStatus("Graph slice persisted.");
    settledRunLabel = runStatusLabel(payload.data?.brainRun);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
    settledRunLabel = "Seed failed";
  } finally {
    setLoading(false, settledRunLabel);
  }
});

elements.artifactCreate?.addEventListener("click", () => {
  void handleArtifactCreate();
});

elements.claimDrawerClose?.addEventListener("click", closeClaimDrawer);
elements.claimDrawerBackdrop?.addEventListener("click", closeClaimDrawer);

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && elements.claimDrawer?.classList.contains("open")) {
    closeClaimDrawer();
  }
});

async function seedBrain(rawIdea) {
  const response = await fetch("/brain/seed", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-user-id": "dev-user",
      "x-project-id": "dev-project",
    },
    body: JSON.stringify({ rawIdea }),
  });
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    const issues = Array.isArray(payload?.error?.issues) ? ` ${payload.error.issues.join(" ")}` : "";
    const message = payload?.error?.message
      ? `${payload.error.message}${issues}`
      : `POST /brain/seed failed with ${response.status}.`;
    throw new Error(message);
  }

  if (!payload?.data?.ideaMap) {
    throw new Error("POST /brain/seed returned an invalid graph slice.");
  }

  return payload;
}

async function fetchClaimDetail(claimId) {
  const response = await fetch(`/brain/claims/${encodeURIComponent(claimId)}/detail`, {
    method: "GET",
    headers: {
      "x-user-id": "dev-user",
      "x-project-id": "dev-project",
    },
  });
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    const issues = Array.isArray(payload?.error?.issues) ? ` ${payload.error.issues.join(" ")}` : "";
    const message = payload?.error?.message
      ? `${payload.error.message}${issues}`
      : `GET /brain/claims/${claimId}/detail failed with ${response.status}.`;
    throw new Error(message);
  }

  if (!payload?.data?.claim || !payload.data.currentVersion || !Array.isArray(payload.data.versions)) {
    throw new Error("Claim detail returned an invalid graph slice.");
  }

  return payload;
}

async function respondToAssumption(claimId, body) {
  const response = await fetch(`/brain/assumptions/${encodeURIComponent(claimId)}/respond`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-user-id": "dev-user",
      "x-project-id": "dev-project",
    },
    body: JSON.stringify(body),
  });
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    const issues = Array.isArray(payload?.error?.issues) ? ` ${payload.error.issues.join(" ")}` : "";
    const message = payload?.error?.message
      ? `${payload.error.message}${issues}`
      : `POST /brain/assumptions/${claimId}/respond failed with ${response.status}.`;
    throw new Error(message);
  }

  if (!payload?.data?.claim || !payload.data.move) {
    throw new Error("Assumption response returned an invalid graph update.");
  }

  return payload;
}

async function issueChallenge(claimId) {
  const response = await fetch("/brain/challenge", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-user-id": "dev-user",
      "x-project-id": "dev-project",
    },
    body: JSON.stringify({ targetClaimId: claimId }),
  });
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    const issues = Array.isArray(payload?.error?.issues) ? ` ${payload.error.issues.join(" ")}` : "";
    const message = payload?.error?.message
      ? `${payload.error.message}${issues}`
      : `POST /brain/challenge failed with ${response.status}.`;
    throw new Error(message);
  }

  if (!payload?.data?.critiqueClaim || !payload.data.challengeEdge || !payload.data.move) {
    throw new Error("Challenge response returned an invalid graph update.");
  }

  return payload;
}

async function respondToChallenge(body) {
  const response = await fetch("/brain/challenge/respond", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-user-id": "dev-user",
      "x-project-id": "dev-project",
    },
    body: JSON.stringify(body),
  });
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    const issues = Array.isArray(payload?.error?.issues) ? ` ${payload.error.issues.join(" ")}` : "";
    const message = payload?.error?.message
      ? `${payload.error.message}${issues}`
      : `POST /brain/challenge/respond failed with ${response.status}.`;
    throw new Error(message);
  }

  if (!payload?.data?.response || !payload.data.move) {
    throw new Error("Challenge response action returned an invalid graph update.");
  }

  return payload;
}

async function askInlineLearn(body) {
  const response = await fetch("/brain/learn/inline", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-user-id": "dev-user",
      "x-project-id": "dev-project",
    },
    body: JSON.stringify(body),
  });
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    const issues = Array.isArray(payload?.error?.issues) ? ` ${payload.error.issues.join(" ")}` : "";
    const message = payload?.error?.message
      ? `${payload.error.message}${issues}`
      : `POST /brain/learn/inline failed with ${response.status}.`;
    throw new Error(message);
  }

  if (!payload?.data?.explanation || !payload.data.brainRun) {
    throw new Error("Makes Cents returned an invalid explanation.");
  }

  return payload;
}

async function saveInlineLearn(body) {
  const response = await fetch("/brain/learn/inline/save", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-user-id": "dev-user",
      "x-project-id": "dev-project",
    },
    body: JSON.stringify(body),
  });
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    const issues = Array.isArray(payload?.error?.issues) ? ` ${payload.error.issues.join(" ")}` : "";
    const message = payload?.error?.message
      ? `${payload.error.message}${issues}`
      : `POST /brain/learn/inline/save failed with ${response.status}.`;
    throw new Error(message);
  }

  if (!payload?.data?.saved?.conceptClaim || !payload.data.saved.teachesEdge || !payload.data.saved.move) {
    throw new Error("Save concept returned an invalid graph update.");
  }

  return payload;
}

async function createArtifact(sessionId) {
  const response = await fetch(`/brain/session/${encodeURIComponent(sessionId)}/artifact`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-user-id": "dev-user",
      "x-project-id": "dev-project",
    },
    body: JSON.stringify({ kind: "challenge_brief" }),
  });
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    const issues = Array.isArray(payload?.error?.issues) ? ` ${payload.error.issues.join(" ")}` : "";
    const message = payload?.error?.message
      ? `${payload.error.message}${issues}`
      : `POST /brain/session/${sessionId}/artifact failed with ${response.status}.`;
    throw new Error(message);
  }

  if (!payload?.data?.artifact?.payload?.challengeBrief || !payload.data.move) {
    throw new Error("Artifact compiler returned an invalid session artifact.");
  }

  return payload;
}

async function runVerify(body) {
  const response = await fetch("/brain/verify", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-user-id": "dev-user",
      "x-project-id": "dev-project",
    },
    body: JSON.stringify(body),
  });
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    const issues = Array.isArray(payload?.error?.issues) ? ` ${payload.error.issues.join(" ")}` : "";
    const message = payload?.error?.message
      ? `${payload.error.message}${issues}`
      : `POST /brain/verify failed with ${response.status}.`;
    throw new Error(message);
  }

  if (!payload?.data?.verdict || !Array.isArray(payload.data.evidenceCards) || !payload.data.move) {
    throw new Error("Verify returned an invalid graph update.");
  }

  return payload;
}

async function readJsonResponse(response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

function renderEmptyState() {
  setText(elements.sessionStatus, "No session");
  setText(elements.sourceKind, "Raw idea");
  setText(elements.currentClaim, "What's on your mind?");
  setText(elements.keyInsight, "Enter one raw idea. Penny will extract assumptions, return typed graph edges, and surface the first challenge.");
  setText(elements.pennyInsight, "The first challenge will appear here after Penny has a graph slice to inspect.");
  setText(elements.failureType, "Waiting");
  setText(elements.weakestPart, "No challenge yet.");
  setText(elements.challengeText, "Submit one idea to reveal the weakest load-bearing part.");
  setText(elements.mapCount, "0 claims");
  setText(elements.laterCount, "0");
  setText(elements.explorationCount, "0 paths");
  setText(elements.learnCount, "0");
  setText(elements.artifactStatus, "Not compiled");
  setText(elements.verifyStatus, "Not run");
  if (elements.artifactCreate) {
    elements.artifactCreate.disabled = true;
    elements.artifactCreate.textContent = "Generate Challenge Brief";
  }
  setThinking(false);
  renderThoughtMap([], []);
  renderExplorationRows([]);
  renderLater([]);
  renderQuickSelect([]);
  renderLearn([]);
  renderArtifact(null);
  renderVerify(null);
  renderResponseOptions([]);
}

function renderCockpit(data) {
  const claims = data.ideaMap?.claims ?? [];
  const edges = data.ideaMap?.edges ?? [];
  const paths = data.explorationPaths ?? [];
  const learnCandidates = data.learnCandidates ?? [];
  const seedClaim = claims.find((claim) => claim.seedId === "claim.seed") ?? claims[0];
  const targetClaim = claims.find((claim) => claim.id === data.firstChallenge?.targetClaimId);
  const conceptCount = claims.filter((claim) => claim.kind === "concept").length;

  setText(
    elements.sessionStatus,
    data.session
      ? `Session ${shortId(data.session.id)} ${formatLabel(data.session.status)} / ${runStatusLabel(data.brainRun)}`
      : "No session",
  );
  setText(elements.sourceKind, formatLabel(data.source?.kind ?? "raw_idea"));
  setText(elements.currentClaim, seedClaim?.text ?? data.source?.rawText ?? "What's on your mind?");
  setText(elements.keyInsight, data.ideaMap?.keyInsight ?? "Penny returned a persisted graph slice.");
  setText(elements.mapCount, `${claims.length} claims`);
  setText(elements.laterCount, String(paths.length));
  setText(elements.explorationCount, `${paths.length} paths`);
  setText(elements.learnCount, String(learnCandidates.length + conceptCount));

  renderThoughtMap(claims, edges);
  renderExplorationRows(paths);
  renderLater(paths);
  renderQuickSelect(claims);
  renderPennyInsight(state.activeChallenge ?? data.firstChallenge, targetClaim);
  renderLearn(learnCandidates);
  renderVerify(state.activeVerify);
  renderArtifact(state.activeArtifact ?? latestArtifact(data.artifacts));
}

function renderThoughtMap(claims, edges) {
  replaceChildren(elements.thoughtMap);

  if (claims.length === 0) {
    elements.thoughtMap?.classList.add("empty-state");
    append(elements.thoughtMap, textOnly("What's on your mind?"));
    return;
  }

  elements.thoughtMap?.classList.remove("empty-state");

  const claimsById = new Map(claims.map((claim) => [claim.id, claim]));
  const seedClaim = claims.find((claim) => claim.seedId === "claim.seed") ?? claims[0];
  const renderedClaimIds = new Set();

  if (seedClaim) {
    append(elements.thoughtMap, claimNode(seedClaim, "root"));
    renderedClaimIds.add(seedClaim.id);
  }

  const returnedEdges = edges.filter((edge) => claimsById.has(edge.fromClaimId) && claimsById.has(edge.toClaimId));
  const seedEdges = seedClaim
    ? returnedEdges.filter((edge) => edge.fromClaimId === seedClaim.id)
    : returnedEdges;
  const remainingEdges = returnedEdges.filter((edge) => !seedEdges.includes(edge));

  for (const edge of seedEdges) {
    const toClaim = claimsById.get(edge.toClaimId);

    append(elements.thoughtMap, edgeConnector(edge));

    if (toClaim && !renderedClaimIds.has(toClaim.id)) {
      append(elements.thoughtMap, claimNode(toClaim));
      renderedClaimIds.add(toClaim.id);
    }
  }

  for (const edge of remainingEdges) {
    const fromClaim = claimsById.get(edge.fromClaimId);
    const toClaim = claimsById.get(edge.toClaimId);

    if (fromClaim && !renderedClaimIds.has(fromClaim.id)) {
      append(elements.thoughtMap, claimNode(fromClaim));
      renderedClaimIds.add(fromClaim.id);
    }

    append(elements.thoughtMap, edgeConnector(edge));

    if (toClaim && !renderedClaimIds.has(toClaim.id)) {
      append(elements.thoughtMap, claimNode(toClaim));
      renderedClaimIds.add(toClaim.id);
    }
  }

  for (const claim of claims) {
    if (!renderedClaimIds.has(claim.id)) {
      append(elements.thoughtMap, claimNode(claim, "unconnected"));
    }
  }
}

function claimNode(claim, modifier = "") {
  const node = document.createElement("article");
  const health = claimHealth(claim);
  const isSelected = state.activeClaimDetail?.claim?.id === claim.id || state.loadingClaimDetailId === claim.id;
  node.className = [
    "map-node",
    claim.kind,
    modifier,
    claim.status ? `status-${claim.status}` : "",
    isSelected ? "is-selected" : "",
    ...health.classes,
  ]
    .filter(Boolean)
    .join(" ");
  node.style.setProperty("--claim-confidence", `${health.confidence}%`);
  node.tabIndex = 0;
  node.setAttribute("role", "button");
  node.setAttribute("aria-label", `Open detail for ${formatLabel(claim.kind)} claim`);

  const meta = document.createElement("span");
  meta.textContent = `${formatLabel(claim.kind)} / ${formatLabel(claim.status)} / ${claim.confidence}%`;

  const text = document.createElement("strong");
  text.textContent = claim.text;

  node.append(meta, text, confidenceMeter(health.confidence), healthBadges(health.badges));

  const actions = claimActions(claim);

  if (actions) {
    append(node, actions);
  }

  node.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("button, input, textarea, a")) {
      return;
    }

    void handleClaimInspect(claim);
  });
  node.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " ") && event.target === node) {
      event.preventDefault();
      void handleClaimInspect(claim);
    }
  });

  return node;
}

function claimActions(claim) {
  const controls = document.createElement("div");
  controls.className = "claim-actions";

  const inspectButton = document.createElement("button");
  inspectButton.type = "button";
  inspectButton.textContent = state.loadingClaimDetailId === claim.id ? "Inspecting" : "Inspect";
  inspectButton.disabled = state.loadingClaimDetailId === claim.id;
  inspectButton.addEventListener("click", (event) => {
    event.stopPropagation();
    void handleClaimInspect(claim);
  });
  append(controls, inspectButton);

  const verifyButton = document.createElement("button");
  verifyButton.type = "button";
  verifyButton.textContent = state.verifyingClaimId === claim.id ? "Checking" : "Verify";
  verifyButton.disabled = state.verifyingClaimId === claim.id;
  verifyButton.addEventListener("click", (event) => {
    event.stopPropagation();
    void handleVerifyClaim(claim);
  });
  append(controls, verifyButton);

  if (claim.kind === "assumption") {
    const isPending = state.respondingClaimId === claim.id;
    const actions = [
      { label: "Confirm", action: "confirm", disabled: claim.status === "committed" },
      { label: "Reject", action: "reject", disabled: claim.status === "rejected" },
      { label: "Refine", action: "refine", disabled: false },
    ];

    for (const item of actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = isPending ? "Saving" : item.label;
      button.disabled = isPending || item.disabled;
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        void handleAssumptionAction(claim, item.action);
      });
      append(controls, button);
    }
  }

  if (["belief", "assumption"].includes(claim.kind)) {
    const challengeButton = document.createElement("button");
    challengeButton.type = "button";
    challengeButton.textContent = state.challengingClaimId === claim.id ? "Challenging" : "Challenge";
    challengeButton.disabled = state.challengingClaimId === claim.id;
    challengeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      void handleChallengeIssue(claim);
    });
    append(controls, challengeButton);
  }

  return controls;
}

async function handleVerifyClaim(claim) {
  if (!state.data?.session?.id) {
    setStatus("Create a graph before running Verify.", true);
    return;
  }

  state.verifyingClaimId = claim.id;
  renderCockpit(state.data);
  setThinking(true, "Verifying");
  setStatus("Running Verify.");

  try {
    const payload = await runVerify({
      claimId: claim.id,
    });
    applyVerify(payload.data);
    await refreshActiveClaimDetail(claim.id);
    setStatus("Verify complete.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    state.verifyingClaimId = null;
    setThinking(false, state.activeVerify ? "Verify ready" : "Ready");
    renderCockpit(state.data);
  }
}

async function handleClaimInspect(claim) {
  state.loadingClaimDetailId = claim.id;
  if (state.activeClaimDetail?.claim?.id !== claim.id) {
    state.activeClaimDetail = null;
  }
  renderCockpit(state.data);
  openClaimDrawer();
  renderClaimDrawerLoading(claim);
  setStatus("Loading claim memory.");

  try {
    const payload = await fetchClaimDetail(claim.id);
    state.activeClaimDetail = payload.data;
    renderClaimDrawer(payload.data);
    setStatus("Claim memory loaded.");
  } catch (error) {
    renderClaimDrawerError(error instanceof Error ? error.message : String(error));
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    state.loadingClaimDetailId = null;
    renderCockpit(state.data);
  }
}

async function refreshActiveClaimDetail(claimId) {
  if (!claimId || state.activeClaimDetail?.claim?.id !== claimId) {
    return;
  }

  try {
    const payload = await fetchClaimDetail(claimId);
    state.activeClaimDetail = payload.data;
    renderClaimDrawer(payload.data);
  } catch (error) {
    renderClaimDrawerError(error instanceof Error ? error.message : String(error));
  }
}

async function handleChallengeIssue(claim) {
  state.challengingClaimId = claim.id;
  renderCockpit(state.data);
  setThinking(true, "Challenging");
  setStatus("Issuing challenge.");

  try {
    const payload = await issueChallenge(claim.id);
    applyIssuedChallenge(payload.data);
    await refreshActiveClaimDetail(claim.id);
    setStatus("Challenge issued.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    state.challengingClaimId = null;
    setThinking(false, state.activeChallenge ? "Challenge ready" : "Ready");
    renderCockpit(state.data);
  }
}

async function handleAssumptionAction(claim, action) {
  const body = assumptionActionBody(claim, action);

  if (!body) {
    return;
  }

  state.respondingClaimId = claim.id;
  renderCockpit(state.data);
  setStatus(`Saving ${formatLabel(action).toLowerCase()} response.`);

  try {
    const payload = await respondToAssumption(claim.id, body);
    applyAssumptionResponse(payload.data);
    await refreshActiveClaimDetail(claim.id);
    setStatus(`${formatLabel(action)} saved.`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    state.respondingClaimId = null;
    renderCockpit(state.data);
  }
}

function assumptionActionBody(claim, action) {
  if (action !== "refine") {
    return { action };
  }

  const refinedText = window.prompt("Refine assumption", claim.text)?.trim();

  if (refinedText === undefined) {
    return null;
  }

  if (!refinedText) {
    setStatus("Refined assumption text cannot be empty.", true);
    return null;
  }

  return {
    action,
    refinedText,
  };
}

function applyAssumptionResponse(data) {
  const claims = state.data?.ideaMap?.claims;

  if (!Array.isArray(claims)) {
    return;
  }

  const index = claims.findIndex((claim) => claim.id === data.claim.id);

  if (index >= 0) {
    claims[index] = {
      ...claims[index],
      ...data.claim,
    };
  }

  if (Array.isArray(state.data.moves)) {
    state.data.moves = [...state.data.moves, data.move];
  }
}

function applyIssuedChallenge(data) {
  if (!state.data?.ideaMap) {
    return;
  }

  upsertClaim(data.critiqueClaim);
  upsertEdge(data.challengeEdge);
  state.activeChallenge = {
    targetClaimId: data.targetClaim.id,
    challengeEdgeId: data.challengeEdge.id,
    critiqueClaimId: data.critiqueClaim.id,
    failureType: data.failureType,
    strength: data.strength,
    weakestPart: data.whyThisCritique,
    challenge: data.critique,
    responseOptions: ["Defend", "Revise", "Absorb"],
    provenanceTag: data.provenanceTag,
    suggestedNextMove: data.suggestedNextMove,
    status: "issued",
  };

  if (Array.isArray(state.data.moves)) {
    state.data.moves = [...state.data.moves, data.move];
  }

  if (data.brainRun) {
    state.data.brainRun = data.brainRun;
  }
}

function applyChallengeResponse(data) {
  if (data.targetClaim) {
    upsertClaim(data.targetClaim);
  }

  upsertEdge(data.challengeEdge);

  if (state.activeChallenge?.challengeEdgeId === data.challengeEdge.id) {
    state.activeChallenge = {
      ...state.activeChallenge,
      status: data.challengeEdge.status,
      lastResponse: data.response,
    };
  }

  if (Array.isArray(state.data?.moves)) {
    state.data.moves = [...state.data.moves, data.move];
  }
}

function upsertClaim(claim) {
  const claims = state.data?.ideaMap?.claims;

  if (!Array.isArray(claims)) {
    return;
  }

  const index = claims.findIndex((existing) => existing.id === claim.id);

  if (index >= 0) {
    claims[index] = {
      ...claims[index],
      ...claim,
    };
    return;
  }

  claims.push(claim);
}

function upsertEdge(edge) {
  const edges = state.data?.ideaMap?.edges;

  if (!Array.isArray(edges)) {
    return;
  }

  const index = edges.findIndex((existing) => existing.id === edge.id);

  if (index >= 0) {
    edges[index] = {
      ...edges[index],
      ...edge,
    };
    return;
  }

  edges.push(edge);
}

function edgeConnector(edge) {
  const row = document.createElement("div");
  const health = edgeHealth(edge);
  row.className = ["map-edge", edge.kind, edge.status ? `status-${edge.status}` : "", ...health.classes].filter(Boolean).join(" ");

  const kind = document.createElement("span");
  kind.textContent = formatLabel(edge.kind);

  const label = document.createElement("p");
  label.textContent = edge.label;

  row.append(kind, label, healthBadges(health.badges, "edge-health"));
  return row;
}

function claimHealth(claim) {
  const edges = graphEdges();
  const relatedEdges = edges.filter((edge) => edge.fromClaimId === claim.id || edge.toClaimId === claim.id);
  const relatedEdgeIds = relatedEdges.map((edge) => edge.id);
  const challengeState = challengeStateForClaim(claim, relatedEdges);
  const recency = recencyForIds([claim.id], relatedEdgeIds);
  const risk = unresolvedRiskForClaim(claim.id, relatedEdgeIds, challengeState);
  const refined = moveHistory().some((move) => move.kind === "assumption_refined" && moveIncludes(move, claim.id, relatedEdgeIds));
  const confidence = clampPercent(claim.confidence);
  const confidenceTier = confidenceTierFor(confidence);
  const classes = [
    `kind-${claim.kind}`,
    `health-status-${claim.status}`,
    `confidence-${confidenceTier}`,
    `recency-${recency.state}`,
    challengeState ? `challenge-${challengeState.state}` : "",
    refined ? "is-refined" : "",
    risk ? "has-unresolved-risk" : "",
  ].filter(Boolean);
  const badges = [
    healthBadge(`kind-${claim.kind}`, formatLabel(claim.kind)),
    healthBadge(`status-${claim.status}`, formatLabel(claim.status)),
    healthBadge(`confidence-${confidenceTier}`, `${confidence}%`),
    healthBadge(`recency-${recency.state}`, recency.label),
  ];

  if (challengeState) {
    badges.push(healthBadge(`challenge-${challengeState.state}`, challengeState.label));
  }

  if (refined) {
    badges.push(healthBadge("refined", "Refined"));
  }

  if (risk) {
    badges.push(healthBadge(`risk-${risk.kind}`, risk.label));
  }

  return {
    confidence,
    classes,
    badges,
  };
}

function edgeHealth(edge) {
  const responseState = isChallengeEdge(edge) ? challengeResponseState(edge.id) : null;
  const recency = recencyForIds([edge.fromClaimId, edge.toClaimId], [edge.id]);
  const risk = unresolvedRiskForEdge(edge);
  const classes = [
    `edge-status-${edge.status}`,
    `recency-${recency.state}`,
    responseState ? `challenge-${responseState.state}` : "",
    risk ? "has-unresolved-risk" : "",
  ].filter(Boolean);
  const badges = [
    healthBadge(`status-${edge.status}`, formatLabel(edge.status)),
    healthBadge(`recency-${recency.state}`, recency.label),
  ];

  if (responseState) {
    badges.push(healthBadge(`challenge-${responseState.state}`, responseState.label));
  }

  if (risk) {
    badges.push(healthBadge(`risk-${risk.kind}`, risk.label));
  }

  return {
    classes,
    badges,
  };
}

function confidenceMeter(confidence) {
  const meter = document.createElement("span");
  meter.className = "claim-confidence-meter";
  meter.setAttribute("aria-label", `${confidence}% confidence`);

  const fill = document.createElement("span");
  fill.style.width = `${confidence}%`;
  meter.append(fill);

  return meter;
}

function healthBadges(badges, className = "claim-health") {
  const row = document.createElement("div");
  row.className = className;

  for (const badge of badges) {
    const element = document.createElement("span");
    element.className = ["health-badge", badge.kind].join(" ");
    element.textContent = badge.label;
    row.append(element);
  }

  return row;
}

function healthBadge(kind, label) {
  return { kind, label };
}

function graphEdges() {
  return Array.isArray(state.data?.ideaMap?.edges) ? state.data.ideaMap.edges : [];
}

function moveHistory() {
  return Array.isArray(state.data?.moves) ? state.data.moves : [];
}

function challengeStateForClaim(claim, relatedEdges) {
  const targetEdges = relatedEdges.filter((edge) => isChallengeEdge(edge) && edge.toClaimId === claim.id);
  const sourceEdge = relatedEdges.find((edge) => isChallengeEdge(edge) && edge.fromClaimId === claim.id);

  if (targetEdges.length > 0) {
    const edge = targetEdges.find((candidate) => candidate.status === "active") ?? targetEdges[0];
    const responseState = challengeResponseState(edge.id);

    if (responseState) {
      return responseState;
    }

    if (edge.status === "acknowledged_vulnerability") {
      return {
        state: "acknowledged",
        label: "Acknowledged",
      };
    }

    return {
      state: "active",
      label: "Active Challenge",
    };
  }

  if (state.activeChallenge?.targetClaimId === claim.id) {
    return {
      state: state.activeChallenge.status === "acknowledged_vulnerability" ? "acknowledged" : "active",
      label: state.activeChallenge.status === "acknowledged_vulnerability" ? "Acknowledged" : "Active Challenge",
    };
  }

  if (state.data?.firstChallenge?.targetClaimId === claim.id) {
    return {
      state: "suggested",
      label: "Weakest",
    };
  }

  if (sourceEdge) {
    return {
      state: "source",
      label: "Critique",
    };
  }

  return null;
}

function challengeResponseState(edgeId) {
  const responseMove = [...moveHistory()]
    .reverse()
    .find(
      (move) =>
        Array.isArray(move.edgeIds) &&
        move.edgeIds.includes(edgeId) &&
        ["user_defended", "claim_revised", "critique_absorbed"].includes(move.kind),
    );

  if (responseMove?.kind === "user_defended") {
    return {
      state: "defended",
      label: "Defended",
    };
  }

  if (responseMove?.kind === "claim_revised") {
    return {
      state: "revised",
      label: "Revised",
    };
  }

  if (responseMove?.kind === "critique_absorbed") {
    return {
      state: "acknowledged",
      label: "Acknowledged",
    };
  }

  return null;
}

function unresolvedRiskForClaim(claimId, edgeIds, challengeState) {
  const artifactRisk = latestUnresolvedRisks().find((risk) => risk.claimId === claimId || edgeIds.includes(risk.edgeId));

  if (artifactRisk) {
    return {
      kind: artifactRisk.kind ?? "artifact",
      label: "Risk",
    };
  }

  if (challengeState?.state === "active") {
    return {
      kind: "challenge",
      label: "Risk",
    };
  }

  return null;
}

function unresolvedRiskForEdge(edge) {
  const artifactRisk = latestUnresolvedRisks().find((risk) => risk.edgeId === edge.id);

  if (artifactRisk) {
    return {
      kind: artifactRisk.kind ?? "artifact",
      label: "Risk",
    };
  }

  if (isChallengeEdge(edge) && edge.status === "active") {
    return {
      kind: "challenge",
      label: "Risk",
    };
  }

  return null;
}

function latestUnresolvedRisks() {
  const artifact = state.activeArtifact ?? latestArtifact(state.data?.artifacts);
  const risks = artifact?.payload?.challengeBrief?.unresolvedRisks;

  return Array.isArray(risks) ? risks : [];
}

function recencyForIds(claimIds, edgeIds) {
  const moves = moveHistory();
  const latestIndex = latestMoveIndex(claimIds, edgeIds);

  if (latestIndex < 0) {
    return {
      state: "quiet",
      label: "Quiet",
    };
  }

  const distance = moves.length - 1 - latestIndex;

  if (distance <= 1) {
    return {
      state: "fresh",
      label: "Fresh",
    };
  }

  if (distance <= 3) {
    return {
      state: "recent",
      label: "Recent",
    };
  }

  return {
    state: "settled",
    label: "Settled",
  };
}

function latestMoveIndex(claimIds, edgeIds) {
  const moves = moveHistory();

  for (let index = moves.length - 1; index >= 0; index -= 1) {
    if (moveIncludes(moves[index], claimIds, edgeIds)) {
      return index;
    }
  }

  return -1;
}

function moveIncludes(move, claimIds, edgeIds) {
  const claimIdList = Array.isArray(claimIds) ? claimIds : [claimIds];
  const edgeIdList = Array.isArray(edgeIds) ? edgeIds : [edgeIds];
  const moveClaimIds = Array.isArray(move?.claimIds) ? move.claimIds : [];
  const moveEdgeIds = Array.isArray(move?.edgeIds) ? move.edgeIds : [];

  return claimIdList.some((claimId) => moveClaimIds.includes(claimId)) || edgeIdList.some((edgeId) => moveEdgeIds.includes(edgeId));
}

function isChallengeEdge(edge) {
  return edge?.kind === "challenges" || edge?.kind === "contradicts";
}

function confidenceTierFor(confidence) {
  if (confidence >= 75) {
    return "high";
  }

  if (confidence >= 50) {
    return "medium";
  }

  return "low";
}

function clampPercent(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function renderExplorationRows(paths) {
  replaceChildren(elements.explorationRows);

  if (paths.length === 0) {
    append(elements.explorationRows, textOnly("Exploration paths appear here as structured rows after the first seed."));
    return;
  }

  paths.forEach((path, index) => {
    const row = document.createElement("article");
    row.className = "exploration-row";

    const number = document.createElement("span");
    number.className = "path-number";
    number.textContent = String(index + 1).padStart(2, "0");

    const body = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = path.title;
    const prompt = document.createElement("p");
    prompt.textContent = path.prompt;
    const value = document.createElement("small");
    value.textContent = path.expectedValue;

    body.append(title, prompt, value);
    row.append(number, body);
    append(elements.explorationRows, row);
  });
}

function renderLater(paths) {
  renderList(
    elements.laterList,
    paths.slice(0, 4),
    (path) => listRow(path.title, path.prompt, path.expectedValue),
    "Exploration paths will collect here.",
  );
}

function renderQuickSelect(claims) {
  replaceChildren(elements.quickSelect);

  if (claims.length === 0) {
    append(elements.quickSelect, textOnly("No claims yet."));
    return;
  }

  for (const claim of claims.slice(0, 6)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "quick-chip";
    button.textContent = formatLabel(claim.kind);
    button.title = claim.text;
    button.addEventListener("click", () => {
      setText(elements.currentClaim, claim.text);
      setText(elements.keyInsight, `Selected returned ${formatLabel(claim.kind).toLowerCase()} claim at ${claim.confidence}% confidence.`);
    });
    append(elements.quickSelect, button);
  }
}

function renderPennyInsight(challenge, targetClaim) {
  const challengeTarget = targetClaim ?? findClaimById(challenge?.targetClaimId);
  const strength = challenge?.strength ? ` / ${formatLabel(challenge.strength)}` : "";

  setText(elements.pennyInsight, challengeTarget?.text ?? challenge?.weakestPart ?? "The first challenge will appear here.");
  setText(elements.failureType, `${formatLabel(challenge?.failureType ?? "waiting")}${strength}`);
  setText(elements.weakestPart, challenge?.weakestPart ?? "No challenge yet.");
  setText(elements.challengeText, challenge?.challenge ?? "Submit one idea to reveal the weakest load-bearing part.");
  renderResponseOptions(challenge);
}

function renderResponseOptions(challenge) {
  replaceChildren(elements.responseOptions);

  const options = challenge?.responseOptions ?? [];

  for (const option of options) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = option;
    button.disabled = state.respondingChallengeId === challenge?.challengeEdgeId;
    button.addEventListener("click", () => {
      void handleChallengeResponse(challenge, option);
    });
    append(elements.responseOptions, button);
  }
}

async function handleChallengeResponse(challenge, option) {
  if (!challenge?.challengeEdgeId) {
    setStatus("Issue a persisted challenge before responding.");
    return;
  }

  const body = challengeResponseBody(challenge, option);

  if (!body) {
    return;
  }

  state.respondingChallengeId = challenge.challengeEdgeId;
  renderCockpit(state.data);
  setStatus(`Saving ${option.toLowerCase()} response.`);

  try {
    const payload = await respondToChallenge(body);
    applyChallengeResponse(payload.data);
    await refreshActiveClaimDetail(challenge.targetClaimId);
    setStatus(`${option} saved.`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    state.respondingChallengeId = null;
    renderCockpit(state.data);
  }
}

function challengeResponseBody(challenge, option) {
  const action = option.toLowerCase();
  const body = {
    response: action,
    challengeEdgeId: challenge.challengeEdgeId,
  };

  if (action === "defend") {
    const reasoning = window.prompt("Defend this claim", "")?.trim();

    if (!reasoning) {
      setStatus("Defend needs reasoning.", true);
      return null;
    }

    return {
      ...body,
      reasoning,
    };
  }

  if (action !== "revise") {
    const reasoning = window.prompt("Absorb note", "")?.trim();

    return reasoning
      ? {
          ...body,
          reasoning,
        }
      : body;
  }

  const targetClaim = findClaimById(challenge.targetClaimId);
  const revisedText = window.prompt("Revise challenged claim", targetClaim?.text ?? "")?.trim();

  if (revisedText === undefined) {
    return null;
  }

  if (!revisedText) {
    setStatus("Revised claim text cannot be empty.", true);
    return null;
  }

  return {
    ...body,
    revisedText,
  };
}

function renderLearn(candidates) {
  replaceChildren(elements.learnList);
  append(elements.learnList, learnAskForm(candidates));

  if (state.activeLearn) {
    append(elements.learnList, learnResultCard(state.activeLearn));
  }

  const savedConcepts = state.data?.ideaMap?.claims?.filter((claim) => claim.kind === "concept") ?? [];
  const rows = [
    ...candidates.map((candidate) => ({
      label: candidate.term,
      title: candidate.unblockExplanation,
      body: candidate.whyItMatters,
      term: candidate.term,
    })),
    ...savedConcepts.map((claim) => ({
      label: "Saved",
      title: claim.text,
      body: "Concept claim connected to the current graph.",
      term: claim.text.split(":")[0],
    })),
  ];

  if (rows.length === 0 && !state.activeLearn) {
    append(elements.learnList, textOnly("Ask Makes Cents about a confusing term in the current graph."));
    return;
  }

  for (const row of rows) {
    const element = listRow(row.label, row.title, row.body);
    element.addEventListener("click", () => {
      const input = element.querySelector("[data-learn-term]");

      if (input instanceof HTMLElement) {
        input.click();
      }
    });

    const button = document.createElement("button");
    button.type = "button";
    button.className = "inline-link";
    button.dataset.learnTerm = row.term;
    button.textContent = "Ask";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      void handleInlineLearn(row.term);
    });
    element.append(button);
    append(elements.learnList, element);
  }
}

function learnAskForm(candidates) {
  const form = document.createElement("form");
  form.className = "learn-form";

  const input = document.createElement("input");
  input.type = "text";
  input.name = "term";
  input.placeholder = candidates[0]?.term ?? "Concept or term";
  input.value = state.activeLearn?.term ?? "";

  const button = document.createElement("button");
  button.type = "submit";
  button.textContent = state.learning ? "Asking" : "Ask";
  button.disabled = state.learning;

  form.append(input, button);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void handleInlineLearn(input.value.trim());
  });

  return form;
}

function learnResultCard(learn) {
  const card = document.createElement("article");
  card.className = "learn-result";

  const title = document.createElement("strong");
  title.textContent = learn.term;

  const explanation = document.createElement("p");
  explanation.textContent = learn.explanation;

  const why = document.createElement("p");
  why.textContent = learn.whyItMattersHere;

  const example = document.createElement("small");
  example.textContent = learn.example;

  const related = document.createElement("div");
  related.className = "related-concepts";

  for (const concept of learn.relatedConcepts ?? []) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.textContent = concept;
    chip.addEventListener("click", () => {
      void handleInlineLearn(concept);
    });
    related.append(chip);
  }

  const save = document.createElement("button");
  save.type = "button";
  save.className = "save-concept";
  save.title = learn.saveSuggestion ?? "Save concept";
  save.textContent = learn.saved ? "Saved" : state.savingLearn ? "Saving" : "Save concept";
  save.disabled = Boolean(learn.saved || state.savingLearn);
  save.addEventListener("click", () => {
    void handleSaveInlineLearn();
  });

  card.append(title, explanation, why, example, related, save);
  return card;
}

async function handleInlineLearn(term) {
  const target = currentLearnTarget();

  if (!state.data?.session?.id || !target) {
    setStatus("Create a graph before asking Makes Cents.", true);
    return;
  }

  if (!term) {
    setStatus("Enter a concept or term for Makes Cents.", true);
    return;
  }

  state.learning = true;
  renderCockpit(state.data);
  setThinking(true, "Learning");
  setStatus("Asking Makes Cents.");

  try {
    const payload = await askInlineLearn({
      term,
      currentClaimId: target.id,
      sessionId: state.data.session.id,
      localContext: target.text,
    });
    state.activeLearn = {
      ...payload.data,
      currentClaimId: target.id,
      sessionId: state.data.session.id,
      localContext: target.text,
      saved: false,
    };
    setStatus("Makes Cents explanation ready.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    state.learning = false;
    setThinking(false, state.activeLearn ? "Learn ready" : "Ready");
    renderCockpit(state.data);
  }
}

async function handleSaveInlineLearn() {
  if (!state.activeLearn) {
    setStatus("Ask Makes Cents before saving a concept.", true);
    return;
  }

  state.savingLearn = true;
  renderCockpit(state.data);
  setStatus("Saving concept.");

  try {
    const payload = await saveInlineLearn({
      term: state.activeLearn.term,
      explanation: state.activeLearn.explanation,
      whyItMattersHere: state.activeLearn.whyItMattersHere,
      example: state.activeLearn.example,
      relatedConcepts: state.activeLearn.relatedConcepts ?? [],
      saveSuggestion: state.activeLearn.saveSuggestion,
      currentClaimId: state.activeLearn.currentClaimId,
      sessionId: state.activeLearn.sessionId,
    });
    applyInlineLearnSave(payload.data.saved);
    await refreshActiveClaimDetail(state.activeLearn.currentClaimId);
    state.activeLearn = {
      ...state.activeLearn,
      saved: true,
    };
    setStatus("Concept saved.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    state.savingLearn = false;
    renderCockpit(state.data);
  }
}

function applyInlineLearnSave(saved) {
  upsertClaim(saved.conceptClaim);
  upsertEdge(saved.teachesEdge);

  if (Array.isArray(state.data?.moves)) {
    state.data.moves = [...state.data.moves, saved.move];
  }
}

async function handleArtifactCreate() {
  if (!state.data?.session?.id) {
    setStatus("Create a graph before generating a Challenge Brief.", true);
    return;
  }

  state.artifactCreating = true;
  renderCockpit(state.data);
  setThinking(true, "Generating brief");
  setStatus("Generating Challenge Brief.");

  try {
    const activeClaimId = state.activeClaimDetail?.claim?.id;
    const payload = await createArtifact(state.data.session.id);
    applyArtifact(payload.data);
    await refreshActiveClaimDetail(activeClaimId);
    setStatus("Challenge Brief generated.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    state.artifactCreating = false;
    setThinking(false, state.activeArtifact ? "Brief ready" : "Ready");
    renderCockpit(state.data);
  }
}

function applyArtifact(data) {
  state.activeArtifact = data.artifact;

  if (Array.isArray(state.data?.artifacts)) {
    state.data.artifacts = [...state.data.artifacts, data.artifact];
  }

  if (Array.isArray(state.data?.moves)) {
    state.data.moves = [...state.data.moves, data.move];
  }

  if (data.brainRun) {
    state.data.brainRun = data.brainRun;
  }
}

function applyVerify(data) {
  state.activeVerify = data;

  if (Array.isArray(state.data?.moves)) {
    state.data.moves = [...state.data.moves, data.move];
  }

  if (data.brainRun) {
    state.data.brainRun = data.brainRun;
  }
}

function renderVerify(verify) {
  replaceChildren(elements.verifyResult);

  if (!verify) {
    setText(elements.verifyStatus, state.data?.session?.id ? "Ready" : "Not run");
    append(elements.verifyResult, textOnly("Run Check on a claim to return citation evidence cards."));
    return;
  }

  const cards = verify.evidenceCards ?? [];
  const target = verify.targetClaim ?? findClaimById(verify.move?.claimIds?.[0]);
  setText(elements.verifyStatus, `${formatLabel(verify.verdict)} / ${cards.length} cards`);

  const summary = document.createElement("article");
  summary.className = "verify-card";

  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = formatLabel(verify.verdict);

  const copy = document.createElement("p");
  copy.textContent = verify.summary;

  const meta = document.createElement("small");
  meta.textContent = target
    ? `${formatLabel(target.kind)} / ${formatLabel(target.status)} / ${target.confidence}% confidence`
    : "Confidence unchanged";

  summary.append(tag, copy, meta);
  append(elements.verifyResult, summary);

  if (cards.length === 0) {
    append(elements.verifyResult, textOnly("No external citations were returned for this run."));
  }

  for (const card of cards.slice(0, 6)) {
    append(elements.verifyResult, evidenceCard(card));
  }

  append(elements.verifyResult, followUpQuestions(verify.followUpQuestions ?? []));
}

function evidenceCard(card) {
  const block = document.createElement("article");
  block.className = "verify-evidence";

  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = `${formatLabel(card.stance)} / ${formatLabel(card.reliability)}`;

  const title = document.createElement("strong");
  title.textContent = card.title;

  const summary = document.createElement("p");
  summary.textContent = card.summary;

  const quote = document.createElement("p");
  quote.className = "verify-quote";
  quote.textContent = card.quote;

  block.append(tag, title, summary, quote);

  if (card.url) {
    const citation = document.createElement("a");
    citation.href = card.url;
    citation.target = "_blank";
    citation.rel = "noreferrer";
    citation.textContent = [formatLabel(card.sourceType), card.publishedAt].filter(Boolean).join(" / ") || card.url;
    block.append(citation);
  }

  return block;
}

function followUpQuestions(questions) {
  const block = document.createElement("article");
  block.className = "verify-note";

  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = "Follow Up";

  block.append(tag);

  if (questions.length === 0) {
    append(block, textOnly("No follow-up questions returned."));
    return block;
  }

  for (const question of questions) {
    const copy = document.createElement("p");
    copy.textContent = question;
    block.append(copy);
  }

  return block;
}

function renderArtifact(artifact) {
  replaceChildren(elements.artifactBrief);

  if (elements.artifactCreate) {
    elements.artifactCreate.disabled = state.artifactCreating || !state.data?.session?.id;
    elements.artifactCreate.textContent = state.artifactCreating ? "Generating" : "Generate Challenge Brief";
  }

  if (!artifact) {
    setText(elements.artifactStatus, state.data?.session?.id ? "Ready" : "Not compiled");
    append(elements.artifactBrief, textOnly("Generate the current session's Challenge Brief from persisted Brain state."));
    return;
  }

  const brief = artifact.payload?.challengeBrief;
  const risks = brief?.unresolvedRisks ?? [];
  const changes = brief?.whatChanged ?? [];
  setText(elements.artifactStatus, `${risks.length} risks`);

  const summary = document.createElement("article");
  summary.className = "artifact-card";

  const title = document.createElement("strong");
  title.textContent = artifact.title;

  const copy = document.createElement("p");
  copy.textContent = artifact.summary;

  const next = document.createElement("small");
  next.textContent = brief?.recommendedNextMove ?? "No next move returned.";

  summary.append(title, copy, next);
  append(elements.artifactBrief, summary);
  append(elements.artifactBrief, artifactList("Unresolved Risks", risks.slice(0, 3), (risk) => risk.text));
  append(elements.artifactBrief, artifactList("What Changed", changes.slice(-4), (change) => change.summary));
}

function artifactList(label, items, renderText) {
  const block = document.createElement("article");
  block.className = "artifact-list";

  const title = document.createElement("span");
  title.className = "tag";
  title.textContent = label;
  block.append(title);

  if (items.length === 0) {
    append(block, textOnly("None"));
    return block;
  }

  for (const item of items) {
    const row = document.createElement("p");
    row.textContent = renderText(item);
    block.append(row);
  }

  return block;
}

function latestArtifact(artifacts) {
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    return null;
  }

  return artifacts.at(-1);
}

function openClaimDrawer() {
  elements.claimDrawer?.classList.add("open");
  elements.claimDrawer?.setAttribute("aria-hidden", "false");

  if (elements.claimDrawerBackdrop) {
    elements.claimDrawerBackdrop.hidden = false;
  }
}

function closeClaimDrawer() {
  state.activeClaimDetail = null;
  state.loadingClaimDetailId = null;
  elements.claimDrawer?.classList.remove("open");
  elements.claimDrawer?.setAttribute("aria-hidden", "true");

  if (elements.claimDrawerBackdrop) {
    elements.claimDrawerBackdrop.hidden = true;
  }

  if (state.data) {
    renderCockpit(state.data);
  }
}

function renderClaimDrawerLoading(claim) {
  setText(elements.claimDrawerTitle, formatLabel(claim.kind));
  replaceChildren(elements.claimDrawerContent, textOnly("Loading claim memory."));
}

function renderClaimDrawerError(message) {
  replaceChildren(elements.claimDrawerContent, textOnly(message));
}

function renderClaimDrawer(detail) {
  const versions = detail.versions ?? [detail.currentVersion, ...(detail.oldVersions ?? [])];
  const chronologicalMoves = [...(detail.moves ?? [])].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());

  setText(elements.claimDrawerTitle, `${formatLabel(detail.claim.kind)} ${shortId(detail.claim.id)}`);
  replaceChildren(
    elements.claimDrawerContent,
    detailSection("Current Version", [versionCard(detail.currentVersion, true)]),
    detailSection(
      "Old Selves Timeline",
      versions.map((version) => versionCard(version, version.isCurrent || version.state === "current")),
      "No ClaimVersions returned for this claim.",
    ),
    detailSection(
      "Confidence History",
      (detail.confidenceHistory ?? []).map(confidenceRow),
      "No confidence history returned.",
    ),
    detailSection("Moves Chronologically", chronologicalMoves.map(moveCard), "No moves returned for this claim."),
    sourceSection(detail.provenance),
    sourceSpansSection(detail.provenance?.spans ?? []),
    detailSection(
      "Connected Claims",
      (detail.connectedClaims ?? []).map(connectedClaimCard),
      "No connected claims returned.",
    ),
    detailSection(
      "Active Challenges",
      (detail.activeChallenges ?? []).map(activeChallengeCard),
      "No active challenges attached.",
    ),
    detailSection(
      "Learned Concepts",
      (detail.learnedConcepts ?? []).map(learnedConceptCard),
      "No saved Learn concepts attached.",
    ),
    detailSection(
      "Artifact References",
      (detail.artifactReferences ?? []).map(artifactReferenceCard),
      "No artifacts reference this claim yet.",
    ),
  );
}

function detailSection(label, children, emptyText = "None") {
  const section = document.createElement("section");
  section.className = "detail-section";

  const title = document.createElement("h3");
  title.textContent = label;
  section.append(title);

  if (children.length === 0) {
    append(section, textOnly(emptyText));
    return section;
  }

  for (const child of children) {
    append(section, child);
  }

  return section;
}

function versionCard(version, isCurrent) {
  const card = document.createElement("article");
  card.className = ["detail-card", isCurrent ? "current" : "old"].join(" ");

  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = `${isCurrent ? "Current" : "Old"} / ${formatLabel(version.status)} / ${version.confidence}%`;

  const text = document.createElement("p");
  text.textContent = version.content;

  const meta = document.createElement("small");
  meta.textContent = `${shortId(version.id)} / ${formatDate(version.createdAt)}`;

  card.append(tag, text, meta);
  return card;
}

function confidenceRow(entry) {
  const row = document.createElement("article");
  row.className = "confidence-row";

  const bar = document.createElement("span");
  bar.style.width = `${Math.max(0, Math.min(100, Number(entry.confidence) || 0))}%`;

  const text = document.createElement("p");
  text.textContent = `${entry.confidence}% / ${formatLabel(entry.state)} / ${formatLabel(entry.status)}`;

  row.append(bar, text);
  return row;
}

function moveCard(move) {
  const card = document.createElement("article");
  card.className = "detail-card move";

  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = formatLabel(move.kind);

  const summary = document.createElement("p");
  summary.textContent = move.summary;

  const detail = document.createElement("small");
  const payloadSummary = movePayloadSummary(move);
  detail.textContent = payloadSummary ? `${formatDate(move.createdAt)} / ${payloadSummary}` : formatDate(move.createdAt);

  card.append(tag, summary, detail);
  return card;
}

function sourceSection(provenance) {
  const children = [];

  if (provenance?.source) {
    const source = document.createElement("article");
    source.className = "detail-card provenance";
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = formatLabel(provenance.source.kind);
    const text = document.createElement("p");
    text.textContent = provenance.source.rawText;
    source.append(tag, text);
    children.push(source);
  }

  return detailSection("Source", children, "No source returned for this claim.");
}

function sourceSpansSection(spans) {
  const children = [];

  for (const span of spans) {
    const row = document.createElement("article");
    row.className = "detail-card span";
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = `${span.label ?? "Source Span"} / ${span.startOffset}-${span.endOffset}`;
    const text = document.createElement("p");
    text.textContent = span.text || `${span.startOffset}-${span.endOffset}`;
    row.append(tag, text);
    children.push(row);
  }

  return detailSection("Source Spans", children, "No SourceSpan provenance returned for this claim.");
}

function connectedClaimCard(connection) {
  const card = document.createElement("article");
  card.className = "detail-card connection";

  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = `${formatLabel(connection.edge.kind)} / ${formatLabel(connection.direction)}`;

  const text = document.createElement("p");
  text.textContent = connection.claim.text;

  const meta = document.createElement("small");
  meta.textContent = `${formatLabel(connection.claim.kind)} / ${formatLabel(connection.edge.status)}`;

  card.append(tag, text, meta);
  return card;
}

function activeChallengeCard(challenge) {
  const card = document.createElement("article");
  card.className = "detail-card challenge";

  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = `${formatLabel(challenge.edge.kind)} / ${formatLabel(challenge.edge.status)}`;

  const critique = document.createElement("p");
  critique.textContent = challenge.critiqueClaim?.text ?? "Critique claim not returned.";

  const meta = document.createElement("small");
  meta.textContent = `${formatLabel(challenge.responseState)} / ${formatLabel(challenge.edge.label ?? "unlabeled")}`;

  card.append(tag, critique, meta);
  return card;
}

function learnedConceptCard(concept) {
  const card = document.createElement("article");
  card.className = "detail-card concept";

  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = formatLabel(concept.edge.kind);

  const text = document.createElement("p");
  text.textContent = concept.conceptClaim.text;

  const meta = document.createElement("small");
  meta.textContent = `Teaches ${shortId(concept.attachedClaim.id)}`;

  card.append(tag, text, meta);
  return card;
}

function artifactReferenceCard(artifact) {
  const card = document.createElement("article");
  card.className = "detail-card artifact-reference";

  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = `${formatLabel(artifact.kind)} / ${(artifact.referenceReasons ?? []).map(formatLabel).join(", ") || "Referenced"}`;

  const title = document.createElement("strong");
  title.textContent = artifact.title;

  const summary = document.createElement("p");
  summary.textContent = artifact.summary;

  const meta = document.createElement("small");
  meta.textContent = `${shortId(artifact.id)} / ${formatDate(artifact.createdAt)}`;

  card.append(tag, title, summary, meta);
  return card;
}

function movePayloadSummary(move) {
  const payload = move.payload && typeof move.payload === "object" ? move.payload : {};
  const parts = [
    stringValue(payload, "response"),
    stringValue(payload, "reasoning"),
    stringValue(payload, "previousVersionId") ?? stringValue(payload, "previousClaimVersionId"),
    stringValue(payload, "currentVersionId") ?? stringValue(payload, "currentClaimVersionId"),
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" / ") : "";
}

function currentLearnTarget() {
  return (
    findClaimById(state.activeChallenge?.targetClaimId) ??
    findClaimById(state.data?.firstChallenge?.targetClaimId) ??
    state.data?.ideaMap?.claims?.find((claim) => claim.seedId === "claim.seed") ??
    state.data?.ideaMap?.claims?.[0]
  );
}

function renderList(container, items, renderItem, emptyText) {
  replaceChildren(container);

  if (items.length === 0) {
    append(container, textOnly(emptyText));
    return;
  }

  for (const item of items) {
    append(container, renderItem(item));
  }
}

function listRow(label, title, body) {
  const row = document.createElement("article");
  row.className = "list-row";

  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = label;

  const strong = document.createElement("strong");
  strong.textContent = title;

  const copy = document.createElement("p");
  copy.textContent = body;

  row.append(tag, strong, copy);
  return row;
}

function textOnly(value) {
  const paragraph = document.createElement("p");
  paragraph.className = "quiet";
  paragraph.textContent = value;
  return paragraph;
}

function setLoading(isLoading, settledRunLabel = null) {
  if (elements.seedSubmit) {
    elements.seedSubmit.disabled = isLoading;
    elements.seedSubmit.textContent = isLoading ? "Thinking" : "Explore";
  }

  setThinking(isLoading, settledRunLabel);

  if (isLoading) {
    setStatus("Penny is thinking.");
  }
}

function setThinking(isThinking, label = null) {
  document.body.classList.toggle("is-thinking", isThinking);
  setText(elements.thinkingIndicator, label ?? (isThinking ? "Penny is thinking" : "Ready"));
}

function runStatusLabel(brainRun) {
  return brainRun?.status ? `Run ${formatLabel(brainRun.status)}` : "Ready";
}

function setStatus(message, isError = false) {
  setText(elements.formStatus, message);
  elements.formStatus?.classList.toggle("error", isError);
}

function setText(element, value) {
  if (element) {
    element.textContent = value;
  }
}

function replaceChildren(element, ...children) {
  element?.replaceChildren(...children);
}

function append(element, child) {
  element?.append(child);
}

function findClaimById(claimId) {
  return state.data?.ideaMap?.claims?.find((claim) => claim.id === claimId);
}

function formatLabel(value) {
  return String(value ?? "")
    .replaceAll("_", " ")
    .replaceAll(".", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function shortId(value) {
  return String(value ?? "").slice(0, 8);
}

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value ?? "");
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function stringValue(source, key) {
  const value = source?.[key];

  return typeof value === "string" && value.trim() ? value : null;
}
