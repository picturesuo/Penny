import { createHash } from "node:crypto";

export type ContextProvider = "manual" | "chatgpt" | "gmail" | "calendar" | "slack" | "canvas" | "instagram";

export type ContextSourceClass =
  | "manual"
  | "private_export"
  | "email"
  | "calendar_event"
  | "chat"
  | "learning_platform"
  | "social";

export type MemoryShardType =
  | "claim"
  | "preference"
  | "goal"
  | "taste"
  | "style"
  | "idea_history"
  | "project"
  | "person"
  | "deadline"
  | "concept";

export type MemoryReviewStatus = "pending" | "approved" | "auto_approved" | "rejected" | "merged" | "deprioritized";

export type BrainEdgeType =
  | "supports"
  | "contradicts"
  | "inspired_by"
  | "depends_on"
  | "person_related"
  | "project_related"
  | "deadline_for"
  | "learned_from"
  | "checked_by";

export type SnippetPolicy = "metadata_only" | "redacted_snippet" | "full_snippet" | "blocked";

export type ConnectorScopeSelection = {
  provider: ContextProvider;
  sourceUri?: string;
  label?: string;
  owner?: string;
  scopes?: readonly string[];
  labels?: readonly string[];
  threadIds?: readonly string[];
  senders?: readonly string[];
  dateRange?: {
    from?: string;
    to?: string;
  };
  searchQueries?: readonly string[];
  channelIds?: readonly string[];
  calendarIds?: readonly string[];
  readOnly?: boolean;
  metadataFirst?: boolean;
  includeFullBodies?: boolean;
  manualExport?: boolean;
  rawRetention?: boolean;
};

export type ConnectorScopePlan = {
  provider: ContextProvider;
  allowed: boolean;
  stage: "ready" | "manual_only" | "later";
  sourceClass: ContextSourceClass;
  minimumScope: Record<string, unknown>;
  warnings: string[];
};

export type RedactionFindingType =
  | "secret"
  | "password"
  | "api_key"
  | "card_or_bank"
  | "ssn"
  | "email"
  | "phone"
  | "address"
  | "medical"
  | "legal"
  | "minor"
  | "private_message";

export type RedactionFinding = {
  type: RedactionFindingType;
  count: number;
};

export type SourceDigestDraft = {
  title: string;
  summary: string;
  provenance: {
    provider: ContextProvider;
    sourceUri: string;
    sourceClass: ContextSourceClass;
    chunkHash: string;
    rawRetained: boolean;
  };
};

export type MemoryShardDraft = {
  id: string;
  text: string;
  type: MemoryShardType;
  sourceClass: ContextSourceClass;
  confidence: number;
  decay: number;
  visibility: "private" | "workspace" | "project";
  reviewStatus: MemoryReviewStatus;
  lastSeen: string;
  topicCluster: string;
  evidence: EvidencePointerDraft[];
};

export type EvidencePointerDraft = {
  sourceUri: string;
  locator: {
    chunkHash: string;
    line?: number;
    pattern?: string;
  };
  snippetPolicy: SnippetPolicy;
};

export type BrainNodeDraft = {
  id: string;
  type: "claim" | "assumption" | "counterargument" | "concept" | "project" | "person" | "deadline" | "memory_shard";
  title: string;
  summary: string;
  status: "active" | "needs_review";
  shardId?: string;
};

export type BrainEdgeDraft = {
  fromNode: string;
  toNode: string;
  type: BrainEdgeType;
  weight: number;
  evidenceIds: string[];
};

export type EphemeralProcessInput = {
  provider: ContextProvider;
  sourceUri: string;
  label: string;
  text: string;
  fetchedAt?: string;
  autoApprove?: boolean;
  rawRetention?: boolean;
};

export type EphemeralProcessResult = {
  source: {
    provider: ContextProvider;
    sourceUri: string;
    label: string;
    sourceClass: ContextSourceClass;
  };
  chunk: {
    hash: string;
    retentionFlag: boolean;
    processingStatus: "deleted" | "retained";
    rawDeleted: boolean;
  };
  redaction: {
    text: string;
    findings: RedactionFinding[];
  };
  digest: SourceDigestDraft;
  memoryShards: MemoryShardDraft[];
  brainNodes: BrainNodeDraft[];
  brainEdges: BrainEdgeDraft[];
  auditEvents: string[];
};

export type RetrievalShard = Pick<
  MemoryShardDraft,
  "id" | "text" | "type" | "confidence" | "decay" | "topicCluster" | "sourceClass" | "evidence"
> & {
  lastSeen: string;
  graphDistance?: number;
  projectRelevance?: number;
  novelty?: number;
  contradicted?: boolean;
};

export type RetrievalRequest = {
  query: string;
  sourceGroup?: ContextSourceClass;
  topicCluster?: string;
  limit?: number;
  now?: string;
};

export type RetrievalResult = RetrievalShard & {
  score: number;
  provenance: EvidencePointerDraft[];
  scoreBreakdown: {
    lexical: number;
    graph: number;
    recency: number;
    confidence: number;
    novelty: number;
    project: number;
    decayPenalty: number;
    contradictionPenalty: number;
  };
};

export type CheckSignal = {
  risk:
    | "contradiction"
    | "weak_evidence"
    | "stale_assumption"
    | "circular_reasoning"
    | "missing_user_goal"
    | "risky_decision";
  claim: string;
  explanation: string;
  evidenceIds: string[];
};

export type LearnCardDraft = {
  nodeId: string;
  prompt: string;
  answerHint: string;
  dueAt: string;
  strength: number;
};

const SENSITIVE_PATTERNS: Array<{
  type: RedactionFindingType;
  pattern: RegExp;
  replacement: string;
}> = [
  { type: "api_key", pattern: /\b(?:sk|pk|xox[baprs]|ghp|github_pat)_[A-Za-z0-9_-]{16,}\b/g, replacement: "[REDACTED_API_KEY]" },
  {
    type: "secret",
    pattern: /\b(?:api[_ -]?key|secret|token)\s*[:=]\s*[A-Za-z0-9_.:/+=-]{8,}\b/gi,
    replacement: "[REDACTED_SECRET]",
  },
  {
    type: "password",
    pattern: /\b(?:password|passcode|passwd)\s*[:=]\s*\S{4,}\b/gi,
    replacement: "[REDACTED_PASSWORD]",
  },
  { type: "ssn", pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: "[REDACTED_SSN]" },
  {
    type: "card_or_bank",
    pattern: /\b(?:\d[ -]*?){13,19}\b/g,
    replacement: "[REDACTED_CARD_OR_BANK]",
  },
  { type: "email", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, replacement: "[REDACTED_EMAIL]" },
  {
    type: "phone",
    pattern: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g,
    replacement: "[REDACTED_PHONE]",
  },
  {
    type: "address",
    pattern: /\b\d{1,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,4}\s+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd)\b/g,
    replacement: "[REDACTED_ADDRESS]",
  },
  {
    type: "medical",
    pattern: /\b(?:diagnosis|prescription|therapy|therapist|medical record|patient id)\b/gi,
    replacement: "[REDACTED_MEDICAL]",
  },
  {
    type: "legal",
    pattern: /\b(?:attorney-client|legal settlement|subpoena|lawsuit|NDA)\b/gi,
    replacement: "[REDACTED_LEGAL]",
  },
  {
    type: "minor",
    pattern: /\b(?:my child|minor child|under 13|school pickup|babysitter)\b/gi,
    replacement: "[REDACTED_MINOR]",
  },
  {
    type: "private_message",
    pattern: /\b(?:private message|confidential DM|do not share|off the record)\b/gi,
    replacement: "[REDACTED_PRIVATE_MESSAGE]",
  },
];

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "i",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "we",
  "with",
]);

export function planConnectorScope(selection: ConnectorScopeSelection): ConnectorScopePlan {
  const warnings: string[] = [];
  const minimumScope: Record<string, unknown> = {
    sourceUri: selection.sourceUri ?? sourceUriForProvider(selection.provider),
    scopes: [...(selection.scopes ?? [])],
    rawRetention: selection.rawRetention === true,
  };

  switch (selection.provider) {
    case "manual":
      return {
        provider: selection.provider,
        allowed: true,
        stage: "ready",
        sourceClass: "manual",
        minimumScope,
        warnings,
      };
    case "chatgpt":
      if (!selection.manualExport) {
        warnings.push("ChatGPT starts with export/upload/import instead of account-wide connector sync.");
      }

      return {
        provider: selection.provider,
        allowed: selection.manualExport === true,
        stage: "manual_only",
        sourceClass: "private_export",
        minimumScope: { ...minimumScope, manualExport: selection.manualExport === true },
        warnings,
      };
    case "gmail": {
      const selective = hasAny(selection.labels) || hasAny(selection.threadIds) || hasAny(selection.senders) || hasAny(selection.searchQueries) || Boolean(selection.dateRange?.from || selection.dateRange?.to);

      if (!selective) {
        warnings.push("Gmail requires labels, threads, senders, date ranges, or search queries before sync.");
      }

      if (selection.includeFullBodies) {
        warnings.push("Gmail should prefer metadata and snippets before full message bodies.");
      }

      return {
        provider: selection.provider,
        allowed: selective && selection.includeFullBodies !== true,
        stage: "ready",
        sourceClass: "email",
        minimumScope: {
          ...minimumScope,
          labels: [...(selection.labels ?? [])],
          threadIds: [...(selection.threadIds ?? [])],
          senders: [...(selection.senders ?? [])],
          dateRange: selection.dateRange ?? {},
          searchQueries: [...(selection.searchQueries ?? [])],
          metadataFirst: selection.metadataFirst !== false,
        },
        warnings,
      };
    }
    case "calendar":
      if (selection.readOnly === false) {
        warnings.push("Calendar starts read-only.");
      }

      return {
        provider: selection.provider,
        allowed: selection.readOnly !== false,
        stage: "ready",
        sourceClass: "calendar_event",
        minimumScope: {
          ...minimumScope,
          calendarIds: [...(selection.calendarIds ?? [])],
          readOnly: selection.readOnly !== false,
        },
        warnings,
      };
    case "slack":
      warnings.push("Slack is later and must use selected channels and date ranges only.");
      return {
        provider: selection.provider,
        allowed: false,
        stage: "later",
        sourceClass: "chat",
        minimumScope: {
          ...minimumScope,
          channelIds: [...(selection.channelIds ?? [])],
          dateRange: selection.dateRange ?? {},
        },
        warnings,
      };
    case "canvas":
      warnings.push("Canvas is later because OAuth, developer keys, and scopes are institution-dependent.");
      return {
        provider: selection.provider,
        allowed: false,
        stage: "later",
        sourceClass: "learning_platform",
        minimumScope,
        warnings,
      };
    case "instagram":
      warnings.push("Instagram is later and should use manual export or creator/business analytics only.");
      return {
        provider: selection.provider,
        allowed: false,
        stage: "later",
        sourceClass: "social",
        minimumScope: { ...minimumScope, manualExport: selection.manualExport === true },
        warnings,
      };
  }
}

export function redactPrivateText(text: string): { text: string; findings: RedactionFinding[] } {
  let redacted = text;
  const counts = new Map<RedactionFindingType, number>();

  for (const rule of SENSITIVE_PATTERNS) {
    redacted = redacted.replace(rule.pattern, (...args: unknown[]) => {
      const match = String(args[0] ?? "");

      if (match.length === 0) {
        return match;
      }

      counts.set(rule.type, (counts.get(rule.type) ?? 0) + 1);
      return rule.replacement;
    });
  }

  return {
    text: redacted,
    findings: [...counts.entries()].map(([type, count]) => ({ type, count })),
  };
}

export function processEphemeralContext(input: EphemeralProcessInput): EphemeralProcessResult {
  const sourceClass = sourceClassForProvider(input.provider);
  const redaction = redactPrivateText(input.text);
  const chunkHash = hashText(`${input.provider}:${input.sourceUri}:${redaction.text}`);
  const rawRetained = input.rawRetention === true;
  const memoryShards = extractMemoryShards({
    text: redaction.text,
    provider: input.provider,
    sourceUri: input.sourceUri,
    sourceClass,
    chunkHash,
    autoApprove: input.autoApprove === true,
    lastSeen: input.fetchedAt ?? new Date().toISOString(),
  });
  const digest = buildSourceDigest({
    text: redaction.text,
    provider: input.provider,
    sourceUri: input.sourceUri,
    label: input.label,
    sourceClass,
    chunkHash,
    rawRetained,
  });
  const brainNodes = memoryShards.map((shard): BrainNodeDraft => {
    const node: BrainNodeDraft = {
      id: `node:${shard.id}`,
      type: nodeTypeForShard(shard.type),
      title: titleFromText(shard.text),
      summary: shard.text,
      status: shard.reviewStatus === "pending" ? "needs_review" : "active",
      shardId: shard.id,
    };

    return node;
  });
  const brainEdges = buildBrainEdges(brainNodes, memoryShards);

  return {
    source: {
      provider: input.provider,
      sourceUri: input.sourceUri,
      label: input.label,
      sourceClass,
    },
    chunk: {
      hash: chunkHash,
      retentionFlag: rawRetained,
      processingStatus: rawRetained ? "retained" : "deleted",
      rawDeleted: !rawRetained,
    },
    redaction,
    digest,
    memoryShards,
    brainNodes,
    brainEdges,
    auditEvents: [
      "source.fetched",
      redaction.findings.length > 0 ? "chunk.redacted" : "chunk.checked",
      "memory.extracted",
      rawRetained ? "chunk.retained" : "chunk.deleted",
    ],
  };
}

export function rankMemoryShards(request: RetrievalRequest, shards: readonly RetrievalShard[]): RetrievalResult[] {
  const limit = clamp(request.limit ?? 5, 1, 12);
  const nowMs = Date.parse(request.now ?? new Date().toISOString());
  const queryTokens = tokenize(request.query);
  const filtered = shards.filter((shard) => {
    if (request.sourceGroup && shard.sourceClass !== request.sourceGroup) {
      return false;
    }

    if (request.topicCluster && shard.topicCluster !== request.topicCluster) {
      return false;
    }

    return true;
  });

  return filtered
    .map((shard): RetrievalResult => {
      const shardTokens = tokenize(`${shard.text} ${shard.topicCluster} ${shard.type}`);
      const lexical = overlapScore(queryTokens, shardTokens);
      const graph = shard.graphDistance === undefined ? 0.4 : 1 / (1 + Math.max(0, shard.graphDistance));
      const recency = recencyScore(shard.lastSeen, nowMs);
      const confidence = clamp(shard.confidence, 0, 100) / 100;
      const novelty = clamp(shard.novelty ?? 0.5, 0, 1);
      const project = clamp(shard.projectRelevance ?? 0.5, 0, 1);
      const decayPenalty = clamp(shard.decay, 0, 100) / 100;
      const contradictionPenalty = shard.contradicted ? 0.35 : 0;
      const score =
        lexical * 0.28 +
        graph * 0.14 +
        recency * 0.14 +
        confidence * 0.18 +
        novelty * 0.08 +
        project * 0.12 -
        decayPenalty * 0.2 -
        contradictionPenalty;

      return {
        ...shard,
        score: roundScore(Math.max(0, score)),
        provenance: shard.evidence,
        scoreBreakdown: {
          lexical,
          graph,
          recency,
          confidence,
          novelty,
          project,
          decayPenalty,
          contradictionPenalty,
        },
      };
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export function checkMemoryGraph(input: {
  shards: readonly RetrievalShard[];
  edges?: readonly BrainEdgeDraft[];
  now?: string;
}): CheckSignal[] {
  const signals: CheckSignal[] = [];
  const nowMs = Date.parse(input.now ?? new Date().toISOString());

  for (const shard of input.shards) {
    if (shard.contradicted) {
      signals.push({
        risk: "contradiction",
        claim: shard.text,
        explanation: "This memory is marked contradicted and should not be used without review.",
        evidenceIds: shard.evidence.map((evidence) => evidence.locator.chunkHash),
      });
    }

    if (shard.confidence < 45 || shard.evidence.length === 0) {
      signals.push({
        risk: "weak_evidence",
        claim: shard.text,
        explanation: "This memory has low confidence or no usable evidence pointer.",
        evidenceIds: shard.evidence.map((evidence) => evidence.locator.chunkHash),
      });
    }

    if (shard.type === "claim" && recencyScore(shard.lastSeen, nowMs) < 0.2) {
      signals.push({
        risk: "stale_assumption",
        claim: shard.text,
        explanation: "This claim has not been seen recently and should be reviewed before it anchors a decision.",
        evidenceIds: shard.evidence.map((evidence) => evidence.locator.chunkHash),
      });
    }

    if (/\b(?:decide|launch|hire|fire|raise|fundraising|legal|medical|bank|wire)\b/i.test(shard.text)) {
      signals.push({
        risk: "risky_decision",
        claim: shard.text,
        explanation: "This memory touches a high-impact decision area and should be checked against current evidence.",
        evidenceIds: shard.evidence.map((evidence) => evidence.locator.chunkHash),
      });
    }
  }

  if (!input.shards.some((shard) => shard.type === "goal")) {
    signals.push({
      risk: "missing_user_goal",
      claim: "No active user goal was retrieved.",
      explanation: "Penny should retrieve or ask for the user's goal before optimizing decisions.",
      evidenceIds: [],
    });
  }

  const edges = input.edges ?? [];
  for (const edge of edges) {
    if (edge.type === "depends_on" && edges.some((candidate) => candidate.type === "depends_on" && candidate.fromNode === edge.toNode && candidate.toNode === edge.fromNode)) {
      signals.push({
        risk: "circular_reasoning",
        claim: `${edge.fromNode} depends on ${edge.toNode}`,
        explanation: "The graph contains a reciprocal dependency that may be circular reasoning.",
        evidenceIds: [...edge.evidenceIds],
      });
    }
  }

  return signals;
}

export function createLearnCardsForShards(
  shards: readonly RetrievalShard[],
  options: { now?: string; maxCards?: number } = {},
): LearnCardDraft[] {
  const nowMs = Date.parse(options.now ?? new Date().toISOString());
  const maxCards = clamp(options.maxCards ?? 6, 1, 12);

  return shards
    .filter((shard) => shard.type === "concept" || shard.type === "claim" || shard.type === "goal")
    .slice(0, maxCards)
    .map((shard, index) => ({
      nodeId: `node:${shard.id}`,
      prompt: promptForShard(shard),
      answerHint: titleFromText(shard.text),
      dueAt: new Date(nowMs + (index + 1) * 24 * 60 * 60 * 1000).toISOString(),
      strength: clamp(Math.round(shard.confidence - shard.decay), 0, 100),
    }));
}

function extractMemoryShards(input: {
  text: string;
  provider: ContextProvider;
  sourceUri: string;
  sourceClass: ContextSourceClass;
  chunkHash: string;
  autoApprove: boolean;
  lastSeen: string;
}): MemoryShardDraft[] {
  const lines = input.text
    .split(/\r?\n|(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 12);
  const shards: MemoryShardDraft[] = [];

  for (const [index, line] of lines.entries()) {
    const type = shardTypeForLine(line);

    if (!type) {
      continue;
    }

    const evidence: EvidencePointerDraft = {
      sourceUri: input.sourceUri,
      locator: {
        chunkHash: input.chunkHash,
        line: index + 1,
        pattern: titleFromText(line),
      },
      snippetPolicy: input.sourceClass === "email" || input.sourceClass === "chat" ? "redacted_snippet" : "metadata_only",
    };

    shards.push({
      id: `shard:${hashText(`${input.provider}:${input.sourceUri}:${index}:${line}`).slice(0, 16)}`,
      text: line,
      type,
      sourceClass: input.sourceClass,
      confidence: confidenceForLine(line, input.sourceClass),
      decay: input.sourceClass === "calendar_event" ? 10 : 0,
      visibility: "private",
      reviewStatus: input.autoApprove ? "auto_approved" : "pending",
      lastSeen: input.lastSeen,
      topicCluster: topicClusterForText(line),
      evidence: [evidence],
    });
  }

  return dedupeShards(shards).slice(0, 24);
}

function buildSourceDigest(input: {
  text: string;
  provider: ContextProvider;
  sourceUri: string;
  label: string;
  sourceClass: ContextSourceClass;
  chunkHash: string;
  rawRetained: boolean;
}): SourceDigestDraft {
  const sentences = input.text
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const summary = sentences.slice(0, 2).join(" ").slice(0, 500);

  return {
    title: input.label || titleFromText(input.sourceUri),
    summary: summary || "Imported source produced no reusable memory after redaction.",
    provenance: {
      provider: input.provider,
      sourceUri: input.sourceUri,
      sourceClass: input.sourceClass,
      chunkHash: input.chunkHash,
      rawRetained: input.rawRetained,
    },
  };
}

function buildBrainEdges(nodes: readonly BrainNodeDraft[], shards: readonly MemoryShardDraft[]): BrainEdgeDraft[] {
  const edges: BrainEdgeDraft[] = [];
  const byType = new Map<MemoryShardType, BrainNodeDraft[]>();

  for (const node of nodes) {
    const shard = shards.find((candidate) => `node:${candidate.id}` === node.id);

    if (!shard) {
      continue;
    }

    byType.set(shard.type, [...(byType.get(shard.type) ?? []), node]);
  }

  for (const goal of byType.get("goal") ?? []) {
    for (const project of byType.get("project") ?? []) {
      edges.push({ fromNode: goal.id, toNode: project.id, type: "project_related", weight: 70, evidenceIds: [] });
    }
  }

  for (const deadline of byType.get("deadline") ?? []) {
    for (const project of byType.get("project") ?? []) {
      edges.push({ fromNode: deadline.id, toNode: project.id, type: "deadline_for", weight: 80, evidenceIds: [] });
    }
  }

  for (const concept of byType.get("concept") ?? []) {
    for (const claim of byType.get("claim") ?? []) {
      edges.push({ fromNode: concept.id, toNode: claim.id, type: "learned_from", weight: 55, evidenceIds: [] });
    }
  }

  return edges;
}

function shardTypeForLine(line: string): MemoryShardType | null {
  if (/\b(?:i think|we think|claim|assumption|belief|hypothesis)\b/i.test(line)) {
    return "claim";
  }

  if (/\b(?:goal|objective|trying to|want to|need to)\b/i.test(line)) {
    return "goal";
  }

  if (/\b(?:prefer|preference|like|dislike|avoid|tone|style)\b/i.test(line)) {
    return /\b(?:tone|style|voice|write|writing)\b/i.test(line) ? "style" : "preference";
  }

  if (/\b(?:taste|aesthetic|visual|brand)\b/i.test(line)) {
    return "taste";
  }

  if (/\b(?:idea|experiment|prototype|sketch|concept)\b/i.test(line)) {
    return "idea_history";
  }

  if (/\b(?:project|launch|roadmap|milestone)\b/i.test(line)) {
    return "project";
  }

  if (/\b(?:with|met|meeting|collaborator|customer|founder|person)\b/i.test(line)) {
    return "person";
  }

  if (/\b(?:deadline|due|by \d{4}-\d{2}-\d{2}|tomorrow|next week|calendar)\b/i.test(line)) {
    return "deadline";
  }

  if (/\b(?:learn|concept|understand|teach|lesson)\b/i.test(line)) {
    return "concept";
  }

  return null;
}

function confidenceForLine(line: string, sourceClass: ContextSourceClass): number {
  const sourceBase = sourceClass === "calendar_event" ? 82 : sourceClass === "email" ? 72 : 64;
  const evidenceBoost = /\b(?:because|source|confirmed|meeting|deadline|due)\b/i.test(line) ? 8 : 0;
  const uncertaintyPenalty = /\b(?:maybe|might|possibly|unsure|guess)\b/i.test(line) ? 18 : 0;

  return clamp(sourceBase + evidenceBoost - uncertaintyPenalty, 10, 95);
}

function nodeTypeForShard(type: MemoryShardType): BrainNodeDraft["type"] {
  switch (type) {
    case "claim":
      return "claim";
    case "concept":
      return "concept";
    case "project":
      return "project";
    case "person":
      return "person";
    case "deadline":
      return "deadline";
    case "goal":
    case "idea_history":
    case "preference":
    case "style":
    case "taste":
      return "memory_shard";
  }
}

function sourceClassForProvider(provider: ContextProvider): ContextSourceClass {
  switch (provider) {
    case "manual":
      return "manual";
    case "chatgpt":
      return "private_export";
    case "gmail":
      return "email";
    case "calendar":
      return "calendar_event";
    case "slack":
      return "chat";
    case "canvas":
      return "learning_platform";
    case "instagram":
      return "social";
  }
}

function topicClusterForText(text: string): string {
  const tokens = tokenize(text).filter((token) => !STOP_WORDS.has(token));

  return tokens.slice(0, 3).join("_") || "general";
}

function promptForShard(shard: RetrievalShard): string {
  if (shard.type === "concept") {
    return `Teach back this concept: ${titleFromText(shard.text)}`;
  }

  if (shard.type === "goal") {
    return `What current work does this goal affect: ${titleFromText(shard.text)}`;
  }

  return `What evidence would change this claim: ${titleFromText(shard.text)}`;
}

function titleFromText(text: string): string {
  const compacted = compactText(text);

  return compacted.length > 90 ? `${compacted.slice(0, 87).trim()}...` : compacted;
}

function compactText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function overlapScore(left: readonly string[], right: readonly string[]): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const rightSet = new Set(right);
  const overlap = left.filter((token) => rightSet.has(token)).length;

  return overlap / Math.max(1, new Set(left).size);
}

function recencyScore(date: string, nowMs: number): number {
  const thenMs = Date.parse(date);

  if (!Number.isFinite(thenMs) || !Number.isFinite(nowMs)) {
    return 0;
  }

  const ageDays = Math.max(0, (nowMs - thenMs) / (24 * 60 * 60 * 1000));

  return roundScore(1 / (1 + ageDays / 30));
}

function dedupeShards(shards: readonly MemoryShardDraft[]): MemoryShardDraft[] {
  const seen = new Set<string>();
  const deduped: MemoryShardDraft[] = [];

  for (const shard of shards) {
    const key = `${shard.type}:${compactText(shard.text).toLowerCase()}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(shard);
  }

  return deduped;
}

function sourceUriForProvider(provider: ContextProvider): string {
  return `${provider}:selected`;
}

function hasAny(value: readonly unknown[] | undefined): boolean {
  return Array.isArray(value) && value.length > 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}
