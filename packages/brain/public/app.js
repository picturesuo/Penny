const $ = (selector) => document.querySelector(selector);

const elements = {
  artifactBrief: $("#artifactBrief"),
  artifactCreate: $("#artifactCreate"),
  artifactStatus: $("#artifactStatus"),
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
  node.className = ["map-node", claim.kind, modifier, claim.status ? `status-${claim.status}` : ""]
    .filter(Boolean)
    .join(" ");

  const meta = document.createElement("span");
  meta.textContent = `${formatLabel(claim.kind)} / ${formatLabel(claim.status)} / ${claim.confidence}%`;

  const text = document.createElement("strong");
  text.textContent = claim.text;

  node.append(meta, text);

  const actions = claimActions(claim);

  if (actions) {
    append(node, actions);
  }

  return node;
}

function claimActions(claim) {
  if (!["belief", "assumption"].includes(claim.kind)) {
    return null;
  }

  const controls = document.createElement("div");
  controls.className = "claim-actions";

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
      button.addEventListener("click", () => {
        void handleAssumptionAction(claim, item.action);
      });
      append(controls, button);
    }
  }

  const challengeButton = document.createElement("button");
  challengeButton.type = "button";
  challengeButton.textContent = state.challengingClaimId === claim.id ? "Challenging" : "Challenge";
  challengeButton.disabled = state.challengingClaimId === claim.id;
  challengeButton.addEventListener("click", () => {
    void handleChallengeIssue(claim);
  });
  append(controls, challengeButton);

  return controls;
}

async function handleChallengeIssue(claim) {
  state.challengingClaimId = claim.id;
  renderCockpit(state.data);
  setThinking(true, "Challenging");
  setStatus("Issuing challenge.");

  try {
    const payload = await issueChallenge(claim.id);
    applyIssuedChallenge(payload.data);
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
  row.className = `map-edge ${edge.kind}`;

  const kind = document.createElement("span");
  kind.textContent = formatLabel(edge.kind);

  const label = document.createElement("p");
  label.textContent = edge.label;

  row.append(kind, label);
  return row;
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
    const payload = await createArtifact(state.data.session.id);
    applyArtifact(payload.data);
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
