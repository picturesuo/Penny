import type { MemoryEvidenceLevel, MemoryNodeType, RetrievalResult } from "./brain-memory-route.ts";
import type { MemoryRef, SourceRef } from "./create-route.ts";

export type MemoryClass = "semantic" | "episodic" | "procedural" | "emotional_taste";
export type BrainCreateLens = "Personal" | "Practical" | "Valuable" | "Critical" | "Weird";
export type BrainGroundingLabel = "grounded" | "inferred" | "context_light";
export type BrainDevelopmentEventKind =
  | "source_imported"
  | "source_synced"
  | "memory_extracted"
  | "memory_confirmed"
  | "memory_wrong"
  | "memory_boosted"
  | "memory_forgotten"
  | "memory_used_in_create"
  | "option_selected"
  | "option_rejected"
  | "prompt_exported"
  | "export_feedback"
  | "user_changed_direction";

export type SourceNode = {
  id: string;
  label: string;
  kind: SourceRef["kind"];
  excerpt: string;
  url?: string | null | undefined;
};

export type SourceChunk = {
  id: string;
  sourceNodeId: string;
  range: string;
  excerpt: string;
};

export type SourceReference = {
  id: string;
  sourceNode: SourceNode;
  chunk: SourceChunk | null;
  grounded: boolean;
};

export type MemoryNote = {
  id: string;
  text: string;
  memoryClass: MemoryClass;
  evidenceLevel: MemoryEvidenceLevel;
  confidence: number;
  sourceReferences: SourceReference[];
};

export type MemoryNode = MemoryNote & {
  title: string;
  summary: string;
  type: MemoryNodeType | "session" | "manual";
  labels: string[];
  lastSeenAt: string | null;
};

export type MemoryEdge = {
  id: string;
  kind: "derived_from" | "related_to" | "same_cluster" | "supports" | "challenges" | "rejects";
  fromNodeId: string;
  toNodeId: string;
  weight: number;
};

export type ProfileSignal = {
  id: string;
  kind:
    | "recurring_interest"
    | "active_idea_cluster"
    | "taste_signal"
    | "common_frustration"
    | "preferred_build_style"
    | "repeated_rejected_direction";
  label: string;
  summary: string;
  weight: number;
  sourceNodeIds: string[];
};

export type BrainCluster = {
  id: string;
  label: string;
  memoryNodeIds: string[];
  currentNodeId: string | null;
  supersededNodeIds: string[];
};

export type BrainDevelopmentEvent = {
  id: string;
  kind: BrainDevelopmentEventKind;
  explicitness: "explicit" | "implicit";
  weight: number;
  memoryNodeIds: string[];
  sourceReferenceIds: string[];
  summary: string;
  occurredAt: string;
};

export type BrainRankedCandidate = {
  id: string;
  lens: BrainCreateLens;
  title: string;
  topReason: string;
  reasons: string[];
  memoryClass: MemoryClass;
  grounding: BrainGroundingLabel;
  contextLabel: string;
  memoryCount: number;
  sourceCount: number;
  memoryRefs: MemoryRef[];
  sourceReferences: SourceReference[];
  uncertainty: string[];
  nextBestMove: string;
};

export type NextBestMove = {
  id: string;
  title: string;
  action: string;
  whyItMatters: string;
  contextUsed: string[];
  uncertainty: string[];
  grounded: boolean;
  createdAt: string;
};

export type BrainRankerResult = {
  sourceOfTruth: "private_brain_ranker_progress_engine";
  contextLight: boolean;
  nextBestMove: NextBestMove;
  rankedCandidates: BrainRankedCandidate[];
  highValueMemories: MemoryNode[];
  clusters: BrainCluster[];
  developmentEvents: BrainDevelopmentEvent[];
};

type BrainRankScoreDimensions = {
  intentFit: number;
  sourceGrounding: number;
  recency: number;
  confidence: number;
  userConfirmed: number;
  userBoosted: number;
  repeatedUse: number;
  tasteMatch: number;
  projectRelevance: number;
  novelty: number;
  buildability: number;
  externalValue: number;
  emotionalResonance: number;
  rejectedDirectionPenalty: number;
  genericnessRisk: number;
  privacyRisk: number;
  progressValue: number;
};

type ScoredMemoryNode = {
  node: MemoryNode;
  scores: BrainRankScoreDimensions;
  total: number;
};

export function rankBrainForCreate(input: {
  rawIdea: string;
  memoryRefs: MemoryRef[];
  sourceRefs: SourceRef[];
  retrievalResults?: RetrievalResult[] | undefined;
  now?: string | undefined;
}): BrainRankerResult {
  const now = input.now ?? new Date().toISOString();
  const sourceReferences = sourceReferencesFromRefs(input.sourceRefs);
  const memoryNodes = memoryNodesFromInput(input.memoryRefs, sourceReferences, input.retrievalResults ?? []);
  const clusters = buildClusters(memoryNodes);
  const activeMemoryNodes = applyClusterSupersession(memoryNodes, clusters);
  const scored = activeMemoryNodes
    .map((node) => scoreMemoryNode(node, input.rawIdea, now))
    .sort((left, right) => right.total - left.total || left.node.title.localeCompare(right.node.title));
  const contextLight = scored.length === 0;
  const rankedCandidates = buildRankedCandidates({
    rawIdea: input.rawIdea,
    scored,
    sourceReferences,
    contextLight,
  });
  const nextBestMove = buildNextBestMove({
    rawIdea: input.rawIdea,
    rankedCandidates,
    contextLight,
    now,
  });
  const highValueMemories = scored.slice(0, 8).map(({ node }) => node);

  return {
    sourceOfTruth: "private_brain_ranker_progress_engine",
    contextLight,
    nextBestMove,
    rankedCandidates,
    highValueMemories,
    clusters,
    developmentEvents: rankedCandidates.flatMap((candidate) =>
      candidate.memoryRefs.map((memory) => ({
        id: stableRankerId("brain-development-event", "memory_used_in_create", candidate.lens, memory.id, now),
        kind: "memory_used_in_create" as const,
        explicitness: "implicit" as const,
        weight: candidate.grounding === "grounded" ? 0.72 : 0.38,
        memoryNodeIds: [memory.id],
        sourceReferenceIds: candidate.sourceReferences.map((source) => source.id),
        summary: `${candidate.lens} used ${memory.label} because ${candidate.topReason}`,
        occurredAt: now,
      })),
    ),
  };
}

function sourceReferencesFromRefs(sourceRefs: SourceRef[]): SourceReference[] {
  return uniqueById(sourceRefs).map((source) => {
    const node: SourceNode = {
      id: source.id,
      label: source.label,
      kind: source.kind,
      excerpt: source.excerpt,
      url: source.url,
    };
    const chunk: SourceChunk | null = source.sourceRange
      ? {
          id: stableRankerId("source-chunk", source.id, source.sourceRange),
          sourceNodeId: source.id,
          range: source.sourceRange,
          excerpt: source.excerpt,
        }
      : null;

    return {
      id: stableRankerId("source-reference", source.id, source.sourceRange ?? "source"),
      sourceNode: node,
      chunk,
      grounded: source.kind !== "rough_idea",
    };
  });
}

function memoryNodesFromInput(
  memoryRefs: MemoryRef[],
  sourceReferences: SourceReference[],
  retrievalResults: RetrievalResult[],
): MemoryNode[] {
  const byId = new Map<string, MemoryNode>();
  const retrievalByNode = new Map(retrievalResults.map((result) => [result.nodeId, result]));

  for (const memory of uniqueById(memoryRefs)) {
    const retrieval = retrievalByNode.get(memory.id);
    const refs = sourceReferences.filter((source) => retrieval?.sourceId ? source.sourceNode.id === retrieval.sourceId : source.grounded);
    const text = `${memory.label} ${memory.summary}`;
    const type = retrieval?.type ?? memoryTypeFromRef(memory);
    const evidenceLevel = retrieval?.evidenceLevel ?? evidenceLevelFromMemoryRef(memory);
    const confidence = retrieval?.confidence ?? confidenceFromMemoryRef(memory);

    byId.set(memory.id, {
      id: memory.id,
      title: memory.label,
      summary: memory.summary,
      text,
      type,
      labels: labelsFromText(text),
      memoryClass: memoryClassFor(type, text),
      evidenceLevel,
      confidence,
      sourceReferences: refs.length ? refs : sourceReferences.filter((source) => source.sourceNode.kind === "rough_idea").slice(0, 1),
      lastSeenAt: retrieval?.lastSeenAt ?? null,
    });
  }

  return [...byId.values()];
}

function buildClusters(nodes: MemoryNode[]): BrainCluster[] {
  const byKey = new Map<string, MemoryNode[]>();

  for (const node of nodes) {
    const key = clusterKey(node);
    byKey.set(key, [...(byKey.get(key) ?? []), node]);
  }

  return [...byKey.entries()].map(([key, clusterNodes]) => {
    const sorted = [...clusterNodes].sort(compareMemoryFreshness);
    const current = sorted[0] ?? null;

    return {
      id: stableRankerId("brain-cluster", key),
      label: key,
      memoryNodeIds: sorted.map((node) => node.id),
      currentNodeId: current?.id ?? null,
      supersededNodeIds: sorted.slice(1).map((node) => node.id),
    };
  });
}

function applyClusterSupersession(nodes: MemoryNode[], clusters: BrainCluster[]): MemoryNode[] {
  const superseded = new Set(clusters.flatMap((cluster) => cluster.supersededNodeIds));

  return nodes.filter((node) => !superseded.has(node.id));
}

function scoreMemoryNode(node: MemoryNode, rawIdea: string, now: string): ScoredMemoryNode {
  const terms = importantWords(rawIdea);
  const haystack = `${node.title} ${node.summary} ${node.text} ${node.labels.join(" ")}`.toLowerCase();
  const termHits = terms.filter((term) => haystack.includes(term)).length;
  const intentFit = terms.length ? clamp01(termHits / Math.min(terms.length, 8)) : 0.35;
  const sourceGrounding = node.sourceReferences.some((source) => source.grounded) ? 0.92 : node.sourceReferences.length ? 0.42 : 0.15;
  const recency = node.lastSeenAt ? recencyScore(node.lastSeenAt, now) : 0.42;
  const confidence = clamp01(node.confidence);
  const userConfirmed = node.evidenceLevel === "user_confirmed" ? 1 : 0;
  const userBoosted = node.confidence >= 0.92 ? 1 : node.confidence >= 0.82 ? 0.45 : 0;
  const repeatedUse = node.sourceReferences.filter((source) => source.grounded).length > 1 ? 0.65 : 0.25;
  const tasteMatch = node.memoryClass === "emotional_taste" || /\b(prefer|taste|style|excite|frustrat|drain|activat)\b/i.test(haystack) ? 0.9 : 0.2;
  const projectRelevance = node.type === "project" || node.type === "goal" || node.type === "idea" ? 0.85 : /\b(project|mvp|build|ship|create)\b/i.test(haystack) ? 0.6 : 0.22;
  const novelty = /\b(weird|novel|surprising|creative|instrument|different|unusual)\b/i.test(haystack) ? 0.82 : Math.max(0.22, 1 - intentFit * 0.5);
  const buildability = /\b(build|ship|test|verify|small|mvp|prototype|implementation|acceptance)\b/i.test(haystack) ? 0.86 : 0.35;
  const externalValue = /\b(user|customer|founder|market|valuable|value|buyer|team|workflow|decision)\b/i.test(haystack) ? 0.78 : 0.3;
  const emotionalResonance = node.memoryClass === "emotional_taste" ? 0.82 : /\b(frustrat|hate|excite|drain|pain|blocked|slop)\b/i.test(haystack) ? 0.75 : 0.25;
  const rejectedDirectionPenalty =
    node.type === "rejected_direction" && !/\b(reject|avoid|critical|critique|risk|generic|do not|don't)\b/i.test(rawIdea)
      ? 0.72
      : 0;
  const genericnessRisk = /\b(generic|wrapper|chatbot|sidebar|fake|slop)\b/i.test(haystack) ? 0.72 : intentFit < 0.2 ? 0.52 : 0.18;
  const privacyRisk = node.sourceReferences.length === 0 ? 0.72 : 0.12;
  const progressValue = clamp01(
    intentFit * 0.28
      + sourceGrounding * 0.12
      + confidence * 0.13
      + userConfirmed * 0.1
      + tasteMatch * 0.08
      + projectRelevance * 0.1
      + buildability * 0.08
      + externalValue * 0.06
      + emotionalResonance * 0.05
      - rejectedDirectionPenalty * 0.12
      - privacyRisk * 0.04,
  );
  const scores: BrainRankScoreDimensions = {
    intentFit,
    sourceGrounding,
    recency,
    confidence,
    userConfirmed,
    userBoosted,
    repeatedUse,
    tasteMatch,
    projectRelevance,
    novelty,
    buildability,
    externalValue,
    emotionalResonance,
    rejectedDirectionPenalty,
    genericnessRisk,
    privacyRisk,
    progressValue,
  };
  const total = clamp01(
    progressValue * 0.48
      + intentFit * 0.18
      + confidence * 0.12
      + sourceGrounding * 0.08
      + recency * 0.06
      + userBoosted * 0.04
      - rejectedDirectionPenalty * 0.1
      - privacyRisk * 0.04,
  );

  return { node, scores, total };
}

function buildRankedCandidates(input: {
  rawIdea: string;
  scored: ScoredMemoryNode[];
  sourceReferences: SourceReference[];
  contextLight: boolean;
}): BrainRankedCandidate[] {
  const byLens: Record<BrainCreateLens, ScoredMemoryNode[]> = {
    Personal: preferScored(input.scored, (item) => item.scores.tasteMatch + item.scores.userConfirmed + item.scores.emotionalResonance),
    Practical: preferScored(input.scored, (item) => item.scores.buildability + item.scores.confidence + item.scores.projectRelevance),
    Valuable: preferScored(input.scored, (item) => item.scores.externalValue + item.scores.projectRelevance + item.scores.intentFit),
    Critical: preferScored(input.scored, (item) => item.scores.genericnessRisk + item.scores.rejectedDirectionPenalty + item.scores.sourceGrounding),
    Weird: preferScored(input.scored, (item) => item.scores.novelty + item.scores.tasteMatch + item.scores.intentFit * 0.4),
  };

  return (["Personal", "Practical", "Valuable", "Critical", "Weird"] as const).map((lens) => {
    const ranked = byLens[lens].slice(0, 4);
    const top = ranked[0] ?? null;
    const memoryRefs = ranked.map(({ node }) => memoryRefFromNode(node));
    const sourceReferences = uniqueById(ranked.flatMap(({ node }) => node.sourceReferences));
    const grounding: BrainGroundingLabel = input.contextLight ? "context_light" : sourceReferences.some((source) => source.grounded) ? "grounded" : "inferred";
    const topReason = top ? topReasonFor(lens, top) : contextLightReason(lens);

    return {
      id: stableRankerId("brain-ranked-candidate", lens, input.rawIdea, memoryRefs.map((memory) => memory.id).join("|")),
      lens,
      title: titleForLens(lens, top?.node ?? null),
      topReason,
      reasons: reasonsForLens(lens, ranked, input.contextLight),
      memoryClass: top?.node.memoryClass ?? memoryClassForLens(lens),
      grounding,
      contextLabel: grounding === "context_light" ? "Context-light / search-needed / inferred" : grounding === "grounded" ? "Grounded in Brain memory" : "Inferred from light context",
      memoryCount: memoryRefs.length,
      sourceCount: sourceReferences.length || input.sourceReferences.length,
      memoryRefs,
      sourceReferences: sourceReferences.length ? sourceReferences : input.sourceReferences.slice(0, 1),
      uncertainty: uncertaintyFor(lens, ranked, input.contextLight),
      nextBestMove: nextMoveForLens(lens, top?.node ?? null, input.contextLight),
    };
  });
}

function buildNextBestMove(input: {
  rawIdea: string;
  rankedCandidates: BrainRankedCandidate[];
  contextLight: boolean;
  now: string;
}): NextBestMove {
  const top = input.rankedCandidates
    .filter((candidate) => candidate.lens !== "Critical" || candidate.memoryCount > 0)
    .sort((left, right) => right.memoryCount - left.memoryCount || right.sourceCount - left.sourceCount)[0]
    ?? input.rankedCandidates[0];

  if (!top || input.contextLight) {
    return {
      id: stableRankerId("next-best-move", "context-light", input.rawIdea),
      title: "Collect one concrete Brain signal before committing direction",
      action: "Ask for the user's strongest constraint, preferred build style, or rejected direction, then regenerate Create.",
      whyItMatters: "Forward motion is safer when Penny names weak context instead of inventing personal memory.",
      contextUsed: ["Rough idea only"],
      uncertainty: ["No relevant Brain memory was available for this task.", "Future search is needed only after Penny-native memory is insufficient."],
      grounded: false,
      createdAt: input.now,
    };
  }

  return {
    id: stableRankerId("next-best-move", top.id),
    title: `Advance through ${top.lens}`,
    action: top.nextBestMove,
    whyItMatters: top.topReason,
    contextUsed: [
      `${top.memoryCount} memory ref(s)`,
      `${top.sourceCount} source ref(s)`,
      top.contextLabel,
    ],
    uncertainty: top.uncertainty,
    grounded: top.grounding === "grounded",
    createdAt: input.now,
  };
}

function preferScored(scored: ScoredMemoryNode[], preference: (item: ScoredMemoryNode) => number): ScoredMemoryNode[] {
  return [...scored].sort((left, right) => {
    const delta = preference(right) - preference(left);

    return delta || right.total - left.total || left.node.title.localeCompare(right.node.title);
  });
}

function topReasonFor(lens: BrainCreateLens, scored: ScoredMemoryNode): string {
  const summary = clipText(scored.node.summary, 140);

  switch (lens) {
    case "Personal":
      return `This uses a remembered personal signal: ${summary}`;
    case "Practical":
      return `This points to the most buildable next step: ${summary}`;
    case "Valuable":
      return `This ties the idea to a useful external payoff: ${summary}`;
    case "Critical":
      return `This catches genericness or rejected-direction risk: ${summary}`;
    case "Weird":
      return `This expands the idea through a non-obvious but relevant signal: ${summary}`;
  }
}

function reasonsForLens(lens: BrainCreateLens, scored: ScoredMemoryNode[], contextLight: boolean): string[] {
  if (contextLight || scored.length === 0) {
    return [contextLightReason(lens), "Only the rough idea is grounded, so Penny should ask for missing context before claiming personalization."];
  }

  const reasons = scored.slice(0, 3).map((item) => topReasonFor(lens, item));
  const top = scored[0];

  if (top?.node.evidenceLevel === "user_confirmed") {
    reasons.push("User-confirmed memory is weighted above implicit behavior.");
  } else if ((top?.node.confidence ?? 0) >= 0.92) {
    reasons.push("High-confidence or boosted memory is weighted above weaker inferred notes.");
  }

  return uniqueStrings(reasons).slice(0, 4);
}

function uncertaintyFor(lens: BrainCreateLens, scored: ScoredMemoryNode[], contextLight: boolean): string[] {
  if (contextLight || scored.length === 0) {
    return ["No relevant Brain memory matched strongly.", "Label this as context-light/search-needed/inferred."];
  }

  const uncertainty: string[] = [];
  const top = scored[0];

  if (top && top.scores.intentFit < 0.35) {
    uncertainty.push("Memory match is weak against the current rough idea.");
  }
  if (top && top.scores.sourceGrounding < 0.5) {
    uncertainty.push("Source grounding is light; avoid strong provenance claims.");
  }
  if (lens === "Critical" && !scored.some((item) => item.node.type === "rejected_direction")) {
    uncertainty.push("No explicit rejected direction matched, so genericness critique is inferred.");
  }

  return uncertainty.length ? uncertainty : ["No major missing Brain context detected for this lens."];
}

function nextMoveForLens(lens: BrainCreateLens, node: MemoryNode | null, contextLight: boolean): string {
  if (contextLight || !node) {
    return lens === "Critical"
      ? "Add one explicit risk or rejected direction before export."
      : "Ask for one concrete memory, preference, or source constraint before committing this direction.";
  }

  switch (lens) {
    case "Personal":
      return `Pin "${clipText(node.title, 80)}" as a visible Create constraint.`;
    case "Practical":
      return `Turn "${clipText(node.title, 80)}" into the smallest testable implementation step.`;
    case "Valuable":
      return `Rewrite target user and acceptance tests around "${clipText(node.title, 80)}".`;
    case "Critical":
      return `Add verification blockers for the risk behind "${clipText(node.title, 80)}".`;
    case "Weird":
      return `Use "${clipText(node.title, 80)}" to make the artifact more distinctive without leaving the task.`;
  }
}

function titleForLens(lens: BrainCreateLens, node: MemoryNode | null): string {
  return node ? `${lens}: ${clipText(node.title, 80)}` : `${lens}: context-light direction`;
}

function contextLightReason(lens: BrainCreateLens): string {
  return `${lens} is inferred from the rough idea because no relevant durable Brain memory matched.`;
}

function memoryRefFromNode(node: MemoryNode): MemoryRef {
  return {
    id: node.id,
    label: node.title,
    kind: node.type === "preference" ? "preference" : node.type === "source_fact" ? "context" : "brain",
    summary: node.summary,
  };
}

function memoryTypeFromRef(memory: MemoryRef): MemoryNode["type"] {
  if (memory.kind === "preference") {
    return "preference";
  }
  if (memory.kind === "session") {
    return "session";
  }
  if (memory.kind === "context") {
    return "source_fact";
  }
  if (/rejected direction|reject|avoid|do not|don't|generic|fake|wrapper/i.test(`${memory.label} ${memory.summary}`)) {
    return "rejected_direction";
  }
  if (/project|product|app|build|mvp|prototype/i.test(`${memory.label} ${memory.summary}`)) {
    return "project";
  }

  return "manual";
}

function evidenceLevelFromMemoryRef(memory: MemoryRef): MemoryEvidenceLevel {
  const text = `${memory.label} ${memory.summary}`;

  if (/\b(i|we|my|our)\s+(prefer|want|need|decided|chose|avoid|use|care)\b/i.test(text)) {
    return "user_confirmed";
  }

  return memory.kind === "context" ? "grounded" : "inferred";
}

function confidenceFromMemoryRef(memory: MemoryRef): number {
  const text = `${memory.label} ${memory.summary}`;

  if (/boosted|confirmed|correct|decided|prefer|need|avoid/i.test(text)) {
    return 0.86;
  }
  if (memory.kind === "preference") {
    return 0.78;
  }
  if (memory.kind === "session") {
    return 0.58;
  }

  return 0.68;
}

function memoryClassFor(type: MemoryNode["type"], text: string): MemoryClass {
  if (type === "decision" || /\b(read|chose|selected|built|rejected|exported|yesterday|today|session)\b/i.test(text)) {
    return "episodic";
  }
  if (/\b(process|workflow|how i|how we|prefer to build|style|tests|small reversible|ship)\b/i.test(text)) {
    return "procedural";
  }
  if (type === "preference" || type === "frustration" || /\b(prefer|taste|style|excite|frustrat|drain|hate|love|slop)\b/i.test(text)) {
    return "emotional_taste";
  }

  return "semantic";
}

function memoryClassForLens(lens: BrainCreateLens): MemoryClass {
  switch (lens) {
    case "Personal":
    case "Weird":
      return "emotional_taste";
    case "Practical":
      return "procedural";
    case "Valuable":
    case "Critical":
      return "semantic";
  }
}

function labelsFromText(text: string): string[] {
  const labels: string[] = [];

  if (/\b(prefer|style|taste|aesthetic|should feel)\b/i.test(text)) {
    labels.push("preference");
  }
  if (/\b(project|mvp|prototype|app|build|ship)\b/i.test(text)) {
    labels.push("project");
  }
  if (/\b(frustrat|hate|blocked|pain|slop|drain)\b/i.test(text)) {
    labels.push("frustration");
  }

  return labels;
}

function clusterKey(node: MemoryNode): string {
  const words = importantWords(`${node.title} ${node.summary}`).slice(0, 4);

  return `${node.type}:${words.join("-") || node.id}`;
}

function compareMemoryFreshness(left: MemoryNode, right: MemoryNode): number {
  const confidence = right.confidence - left.confidence;

  if (Math.abs(confidence) > 0.08) {
    return confidence;
  }

  return Date.parse(right.lastSeenAt ?? "") - Date.parse(left.lastSeenAt ?? "");
}

function recencyScore(date: string, now: string): number {
  const thenMs = Date.parse(date);
  const nowMs = Date.parse(now);

  if (!Number.isFinite(thenMs) || !Number.isFinite(nowMs)) {
    return 0.35;
  }

  const days = Math.max(0, (nowMs - thenMs) / 86_400_000);

  if (days <= 7) {
    return 1;
  }
  if (days <= 30) {
    return 0.82;
  }
  if (days <= 120) {
    return 0.58;
  }

  return 0.32;
}

function importantWords(text: string): string[] {
  const stop = new Set([
    "about",
    "after",
    "again",
    "also",
    "before",
    "build",
    "could",
    "create",
    "from",
    "have",
    "into",
    "make",
    "need",
    "penny",
    "should",
    "that",
    "their",
    "there",
    "this",
    "turn",
    "user",
    "with",
    "work",
  ]);

  return uniqueStrings(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/u)
      .filter((word) => word.length >= 4 && !stop.has(word)),
  ).slice(0, 16);
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    if (!item.id || seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    result.push(item);
  }

  return result;
}

function uniqueStrings(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clipText(text: string, max: number): string {
  const compact = text.replace(/\s+/g, " ").trim();

  return compact.length <= max ? compact : `${compact.slice(0, max - 1).trim()}...`;
}

function stableRankerId(prefix: string, ...parts: Array<string | number | null | undefined>): string {
  const input = parts.map((part) => String(part ?? "")).join("\u001f");
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `${prefix}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
