const $ = (selector) => document.querySelector(selector);

const elements = {
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

  try {
    const payload = await seedBrain(rawIdea);
    state.data = payload.data;
    renderCockpit(payload.data);
    setStatus("Graph slice persisted.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    setLoading(false);
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
  const payload = await response.json();

  if (!response.ok) {
    const message = payload?.error?.message ?? `POST /brain/seed failed with ${response.status}.`;
    throw new Error(message);
  }

  return payload;
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
  setThinking(false);
  renderThoughtMap([], []);
  renderExplorationRows([]);
  renderLater([]);
  renderQuickSelect([]);
  renderLearn([]);
  renderResponseOptions([]);
}

function renderCockpit(data) {
  const claims = data.ideaMap?.claims ?? [];
  const edges = data.ideaMap?.edges ?? [];
  const paths = data.explorationPaths ?? [];
  const learnCandidates = data.learnCandidates ?? [];
  const seedClaim = claims.find((claim) => claim.seedId === "claim.seed") ?? claims[0];
  const targetClaim = claims.find((claim) => claim.id === data.firstChallenge?.targetClaimId);

  setText(elements.sessionStatus, data.session ? `Session ${shortId(data.session.id)} ${data.session.status}` : "No session");
  setText(elements.sourceKind, formatLabel(data.source?.kind ?? "raw_idea"));
  setText(elements.currentClaim, seedClaim?.text ?? data.source?.rawText ?? "What's on your mind?");
  setText(elements.keyInsight, data.ideaMap?.keyInsight ?? "Penny returned a persisted graph slice.");
  setText(elements.mapCount, `${claims.length} claims`);
  setText(elements.laterCount, String(paths.length));
  setText(elements.explorationCount, `${paths.length} paths`);
  setText(elements.learnCount, String(learnCandidates.length));

  renderThoughtMap(claims, edges);
  renderExplorationRows(paths);
  renderLater(paths);
  renderQuickSelect(claims);
  renderPennyInsight(data.firstChallenge, targetClaim);
  renderLearn(learnCandidates);
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
  node.className = ["map-node", claim.kind, modifier].filter(Boolean).join(" ");

  const meta = document.createElement("span");
  meta.textContent = `${formatLabel(claim.kind)} / ${claim.confidence}%`;

  const text = document.createElement("strong");
  text.textContent = claim.text;

  node.append(meta, text);
  return node;
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
  setText(elements.pennyInsight, targetClaim?.text ?? challenge?.weakestPart ?? "The first challenge will appear here.");
  setText(elements.failureType, formatLabel(challenge?.failureType ?? "waiting"));
  setText(elements.weakestPart, challenge?.weakestPart ?? "No challenge yet.");
  setText(elements.challengeText, challenge?.challenge ?? "Submit one idea to reveal the weakest load-bearing part.");
  renderResponseOptions(challenge?.responseOptions ?? []);
}

function renderResponseOptions(options) {
  replaceChildren(elements.responseOptions);

  for (const option of options) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = option;
    button.addEventListener("click", () => {
      setStatus(`${option} selected.`);
    });
    append(elements.responseOptions, button);
  }
}

function renderLearn(candidates) {
  renderList(
    elements.learnList,
    candidates,
    (candidate) => listRow(candidate.term, candidate.unblockExplanation, candidate.whyItMatters),
    "Makes Cents concepts appear when the graph exposes a confusing term.",
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

function setLoading(isLoading) {
  if (elements.seedSubmit) {
    elements.seedSubmit.disabled = isLoading;
    elements.seedSubmit.textContent = isLoading ? "Thinking" : "Explore";
  }

  setThinking(isLoading);
  setStatus(isLoading ? "Penny is thinking." : elements.formStatus?.textContent ?? "Ready");
}

function setThinking(isThinking) {
  document.body.classList.toggle("is-thinking", isThinking);
  setText(elements.thinkingIndicator, isThinking ? "Penny is thinking" : "Ready");
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

function formatLabel(value) {
  return String(value ?? "")
    .replaceAll("_", " ")
    .replaceAll(".", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function shortId(value) {
  return String(value ?? "").slice(0, 8);
}
