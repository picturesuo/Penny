const $ = (selector) => document.querySelector(selector);

const elements = {
  artifactCount: $("#artifactCount"),
  artifactList: $("#artifactList"),
  challengeText: $("#challengeText"),
  currentClaim: $("#currentClaim"),
  failureType: $("#failureType"),
  form: $("#seedForm"),
  formStatus: $("#formStatus"),
  keyInsight: $("#keyInsight"),
  laterCount: $("#laterCount"),
  laterList: $("#laterList"),
  learnCount: $("#learnCount"),
  learnList: $("#learnList"),
  mapCount: $("#mapCount"),
  mockMode: $("#mockMode"),
  moveCount: $("#moveCount"),
  moveList: $("#moveList"),
  pennyInsight: $("#pennyInsight"),
  quickSelect: $("#quickSelect"),
  rawIdea: $("#rawIdea"),
  responseOptions: $("#responseOptions"),
  seedSubmit: $("#seedSubmit"),
  sessionStatus: $("#sessionStatus"),
  sourceKind: $("#sourceKind"),
  thoughtMap: $("#thoughtMap"),
  weakestPart: $("#weakestPart"),
};

const state = {
  data: null,
  mock: new URLSearchParams(window.location.search).get("mock") === "1",
};

elements.mockMode.checked = state.mock;
elements.mockMode.addEventListener("change", () => {
  state.mock = elements.mockMode.checked;
  setStatus(state.mock ? "Mock mode" : "Ready");
});

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const rawIdea = elements.rawIdea.value.trim();

  if (!rawIdea) {
    setStatus("Enter one raw idea.", true);
    elements.rawIdea.focus();
    return;
  }

  setLoading(true);

  try {
    const payload = state.mock ? { data: buildMockPayload(rawIdea) } : await seedBrain(rawIdea);
    state.data = payload.data;
    renderCockpit(payload.data);
    setStatus(state.mock ? "Rendered mock seed." : "Seed persisted.");
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

function renderCockpit(data) {
  const claims = data.ideaMap?.claims ?? [];
  const edges = data.ideaMap?.edges ?? [];
  const paths = data.explorationPaths ?? [];
  const moves = data.moves ?? [];
  const artifacts = data.artifacts ?? [];
  const learnCandidates = data.learnCandidates ?? [];
  const seedClaim = claims.find((claim) => claim.seedId === "claim.seed") ?? claims[0];
  const targetClaim = claims.find((claim) => claim.id === data.firstChallenge?.targetClaimId);

  elements.sessionStatus.textContent = data.session ? `Session ${shortId(data.session.id)} ${data.session.status}` : "No session";
  elements.sourceKind.textContent = data.source?.kind ?? "Raw idea";
  elements.currentClaim.textContent = seedClaim?.text ?? data.source?.rawText ?? "No claim";
  elements.keyInsight.textContent = data.ideaMap?.keyInsight ?? "No key insight returned.";
  elements.pennyInsight.textContent =
    targetClaim?.text ?? data.firstChallenge?.weakestPart ?? "Penny will surface the load-bearing claim here.";

  elements.mapCount.textContent = `${claims.length} claims`;
  renderThoughtMap(claims, edges);

  elements.laterCount.textContent = String(paths.length);
  renderList(
    elements.laterList,
    paths,
    (path) => listRow(path.title, path.prompt, path.expectedValue),
    "No exploration paths yet.",
  );

  renderQuickSelect(claims);

  elements.failureType.textContent = formatLabel(data.firstChallenge?.failureType ?? "waiting");
  elements.weakestPart.textContent = data.firstChallenge?.weakestPart ?? "No challenge yet.";
  elements.challengeText.textContent = data.firstChallenge?.challenge ?? "The weakest part appears after seeding.";
  renderResponseOptions(data.firstChallenge?.responseOptions ?? []);

  elements.learnCount.textContent = String(learnCandidates.length);
  renderList(
    elements.learnList,
    learnCandidates,
    (candidate) => listRow(candidate.term, candidate.unblockExplanation, candidate.whyItMatters),
    "No Makes Cents candidates yet.",
  );

  elements.artifactCount.textContent = String(artifacts.length);
  renderList(
    elements.artifactList,
    artifacts,
    (artifact) => listRow(formatLabel(artifact.kind), artifact.title, artifact.summary),
    "No artifacts yet.",
  );

  elements.moveCount.textContent = String(moves.length);
  renderList(
    elements.moveList,
    moves,
    (move) => listRow(formatLabel(move.kind), move.summary, shortId(move.id)),
    "No moves yet.",
  );
}

function renderThoughtMap(claims, edges) {
  elements.thoughtMap.replaceChildren();

  if (claims.length === 0) {
    elements.thoughtMap.classList.add("empty-state");
    elements.thoughtMap.append(textOnly("Enter a raw idea to create the first map."));
    return;
  }

  elements.thoughtMap.classList.remove("empty-state");

  for (const claim of claims) {
    const node = document.createElement("article");
    node.className = `map-node ${claim.kind}`;
    const meta = document.createElement("span");
    meta.textContent = `${formatLabel(claim.kind)} / ${claim.confidence}%`;
    const text = document.createElement("strong");
    text.textContent = claim.text;
    node.append(meta, text);
    elements.thoughtMap.append(node);

    for (const edge of edges.filter((item) => item.fromClaimId === claim.id)) {
      const row = document.createElement("div");
      row.className = "map-edge";
      row.textContent = `${formatLabel(edge.kind)}: ${edge.label}`;
      elements.thoughtMap.append(row);
    }
  }
}

function renderQuickSelect(claims) {
  elements.quickSelect.replaceChildren();

  for (const claim of claims.slice(0, 6)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "quick-chip";
    button.textContent = formatLabel(claim.kind);
    button.title = claim.text;
    button.addEventListener("click", () => {
      elements.currentClaim.textContent = claim.text;
      elements.pennyInsight.textContent = `${formatLabel(claim.kind)} at ${claim.confidence}% confidence.`;
    });
    elements.quickSelect.append(button);
  }
}

function renderResponseOptions(options) {
  elements.responseOptions.replaceChildren();

  for (const option of options) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = option;
    button.addEventListener("click", () => {
      setStatus(`${option} selected for this challenge.`);
    });
    elements.responseOptions.append(button);
  }
}

function renderList(container, items, renderItem, emptyText) {
  container.replaceChildren();

  if (items.length === 0) {
    container.append(textOnly(emptyText));
    return;
  }

  for (const item of items) {
    container.append(renderItem(item));
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
  elements.seedSubmit.disabled = isLoading;
  elements.seedSubmit.textContent = isLoading ? "Seeding" : "Seed Brain";
  setStatus(isLoading ? "Working..." : elements.formStatus.textContent);
}

function setStatus(message, isError = false) {
  elements.formStatus.textContent = message;
  elements.formStatus.classList.toggle("error", isError);
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

function buildMockPayload(rawIdea) {
  const sessionId = "00000000-0000-4000-8000-000000000777";
  const claims = [
    claim("claim.seed", "belief", rawIdea, 62),
    claim("claim.assumption.1", "assumption", "The idea names a real thinking bottleneck rather than a pleasant interface benefit.", 55),
    claim("claim.assumption.2", "assumption", "A compact map can reduce the user's decision burden before any long-term memory exists.", 51),
    claim("claim.assumption.3", "assumption", "The user will trust a first challenge even when it pressures the raw idea.", 48),
  ];
  const edges = [
    edge("edge.seed.assumption.1", claims[0].id, claims[1].id, "depends_on", "depends on the bottleneck being real"),
    edge("edge.seed.assumption.2", claims[0].id, claims[2].id, "depends_on", "depends on structure reducing burden"),
    edge("edge.seed.assumption.3", claims[0].id, claims[3].id, "depends_on", "depends on challenge feeling useful"),
  ];

  return {
    context: { userId: "dev-user", projectId: "dev-project" },
    session: { id: sessionId, status: "open", sourceId: "source.mock", createdAt: new Date().toISOString() },
    source: { id: "source.mock", kind: "raw_idea", rawText: rawIdea },
    ideaMap: {
      artifactId: "artifact.idea_map.persisted",
      keyInsight: "The first useful move is to expose the assumption that carries the most structural risk.",
      claims,
      edges,
    },
    explorationPaths: [
      path("path.define", "Define the bottleneck", "What exactly gets easier if this works?", "Turns the value claim into something testable."),
      path("path.user", "Choose the first user", "Who feels this pain sharply enough to tolerate critique?", "Keeps the first loop narrow."),
      path("path.proof", "Pick proof", "What would show the idea made work better, not just prettier?", "Connects the map to real output."),
      path("path.counter", "Find overload", "Where could Penny create more work by adding structure?", "Surfaces the failure case."),
      path("path.artifact", "Name the artifact", "What should the user leave with after one session?", "Prevents generic chat drift."),
      path("path.alternative", "Compare the simple version", "Could a checklist do this without AI?", "Tests whether the AI layer is load-bearing."),
    ],
    firstChallenge: {
      targetClaimId: claims[1].id,
      targetSeedClaimId: "claim.assumption.1",
      failureType: "definition_failure",
      weakestPart: "The bottleneck is not defined tightly enough yet.",
      challenge: "Defend the exact thinking failure Penny fixes. If the user needs evidence, courage, or execution help instead, revise the claim before building the cockpit around it.",
      responseOptions: ["Defend", "Revise", "Absorb"],
    },
    learnCandidates: [
      {
        id: "learn.load-bearing",
        claimId: claims[1].id,
        seedClaimId: "claim.assumption.1",
        term: "Load-bearing claim",
        whyItMatters: "The challenge depends on finding the assumption that would collapse the rest of the map.",
        unblockExplanation: "A load-bearing claim is the part that supports many other claims. If it fails, the surrounding argument needs major revision.",
      },
    ],
    challengeBrief: {
      artifactId: "artifact.challenge_brief.persisted",
      title: "Challenge Brief",
      summary: "A definition-failure challenge against the load-bearing bottleneck assumption.",
    },
    artifacts: [
      artifact("artifact.idea_map.persisted", "idea_map", "Idea Map", "Seed claim, assumptions, and typed edges."),
      artifact("artifact.challenge_brief.persisted", "challenge_brief", "Challenge Brief", "Weakest part plus Defend, Revise, Absorb."),
    ],
    moves: [
      move("move.1", "source.recorded", "Recorded the raw idea."),
      move("move.2", "claim.created", "Created seed and assumption claims."),
      move("move.3", "edge.created", "Connected the seed claim to assumptions."),
      move("move.4", "challenge.created", "Created the first challenge."),
      move("move.5", "artifact.created", "Created Idea Map and Challenge Brief."),
    ],
  };
}

function claim(id, kind, text, confidence) {
  return { id: `persisted.${id}`, seedId: id, kind, status: "exploratory", text, confidence };
}

function edge(id, fromClaimId, toClaimId, kind, label) {
  return { id: `persisted.${id}`, seedId: id, fromClaimId, toClaimId, kind, label };
}

function path(id, title, prompt, expectedValue) {
  return { id, title, prompt, expectedValue };
}

function artifact(id, kind, title, summary) {
  return { id, seedId: id.replace(".persisted", ""), kind, title, summary, claimIds: [], edgeIds: [] };
}

function move(id, kind, summary) {
  return { id, seedId: id, kind, summary, claimIds: [], edgeIds: [], artifactIds: [] };
}
