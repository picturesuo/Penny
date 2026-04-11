import { cleanSentence } from "@/lib/penny";
import type { NodeAction, ThoughtMapModel, ThoughtNodeKind, ThoughtNodeModel } from "@/types/thought-map";

export const GAP_TYPES = [
  "opposition",
  "evidence",
  "concreteness",
  "stakes",
  "balance",
] as const;

export type GapType = (typeof GAP_TYPES)[number];

export interface GraphCoverageScore {
  opposition: number;
  evidence: number;
  concreteness: number;
  stakes: number;
  balance: number;
}

export interface NodeQualityScore {
  nodeId: string;
  kind: ThoughtNodeKind;
  content: string;
  total: number;
  dimensions: {
    specificity: number;
    concreteness: number;
    nonGeneric: number;
    tension: number;
    redundancy: number;
  };
  issues: string[];
}

export interface GraphGapAnalysis {
  primaryGap: GapType;
  secondaryGap: GapType | null;
  coverage: GraphCoverageScore;
  reasons: string[];
  missingKinds: ThoughtNodeKind[];
  nodeCounts: Record<ThoughtNodeKind, number>;
  nodeQuality: NodeQualityScore[];
  weakNodes: NodeQualityScore[];
  repetitiveNodes: NodeQualityScore[];
  actionSelection: {
    mode: "add_children" | "strengthen_branch" | "replace_weak_branch" | "diversify_branches";
    targetNodeId: string;
    targetNodeKind: ThoughtNodeKind;
    why: string[];
  };
}

function countKinds(map: ThoughtMapModel) {
  return map.nodes.reduce<Record<ThoughtNodeKind, number>>(
    (acc, node) => {
      acc[node.kind] += 1;
      return acc;
    },
    {
      root: 0,
      core_claim: 0,
      why_it_matters: 0,
      assumption: 0,
      counter_argument: 0,
      research: 0,
    },
  );
}

function normalize(text: string) {
  return cleanSentence(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(text: string) {
  return normalize(text)
    .split(" ")
    .filter((token) => token.length >= 4);
}

function tokenOverlap(a: string, b: string) {
  const aTokens = new Set(tokens(a));
  const bTokens = new Set(tokens(b));

  if (aTokens.size === 0 || bTokens.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) {
      intersection += 1;
    }
  }

  return intersection / Math.min(aTokens.size, bTokens.size);
}

function genericPatterns(text: string) {
  return [
    /real problem/i,
    /meaningful value/i,
    /pain point/i,
    /better experience/i,
    /help users/i,
    /good solution/i,
    /could be useful/i,
    /a narrow user/i,
    /the current manual workaround/i,
  ].some((pattern) => pattern.test(text));
}

function hasConcreteSignal(text: string) {
  return /\b(\d+|week|day|minute|minutes|customer|customers|founder|founders|team|teams|contractor|contractors|interview|test|prototype|sprint|regulation)\b/i.test(
    text,
  );
}

function hasStakeSignal(text: string) {
  return /\b(cost|waste|risk|lose|kill|commit|urgent|matters|before customer|before building|decision|momentum|false confidence)\b/i.test(
    text,
  );
}

function hasEvidenceSignal(text: string) {
  return /\b(ask|track|measure|compare|interview|collect|test|proof)\b/i.test(text);
}

function hasTensionSignal(text: string) {
  return /\b(if|unless|instead|but|fail|risk|counter|challenge|weak|block|still)\b/i.test(text);
}

function scoreSpecificity(node: ThoughtNodeModel) {
  let score = 20;
  if (node.content.split(" ").length >= 7) score += 15;
  if (/\b(founders|teams|contractors|developers|compliance)\b/i.test(node.content)) score += 35;
  if (/\b(this idea|this problem|something|anything)\b/i.test(node.content)) score -= 20;
  if (node.kind === "root") score = 70;
  return Math.max(0, Math.min(score, 100));
}

function scoreConcreteness(node: ThoughtNodeModel) {
  let score = hasConcreteSignal(node.content) ? 70 : 20;
  if (node.kind === "research" && hasEvidenceSignal(node.content)) score += 20;
  if (node.content.includes(":")) score += 10;
  return Math.max(0, Math.min(score, 100));
}

function scoreNonGeneric(node: ThoughtNodeModel) {
  let score = 75;
  if (genericPatterns(node.content)) score -= 45;
  if (node.content.length < 30) score -= 10;
  if (/\b(thing|stuff|useful|better)\b/i.test(node.content)) score -= 20;
  return Math.max(0, Math.min(score, 100));
}

function scoreTension(node: ThoughtNodeModel) {
  let score = 20;
  if (node.kind === "counter_argument" || node.kind === "assumption") score += 25;
  if (node.kind === "research" && hasEvidenceSignal(node.content)) score += 20;
  if (node.kind === "why_it_matters" && hasStakeSignal(node.content)) score += 25;
  if (hasTensionSignal(node.content)) score += 20;
  return Math.max(0, Math.min(score, 100));
}

function redundancyPenalty(node: ThoughtNodeModel, map: ThoughtMapModel) {
  const comparable = map.nodes.filter((candidate) => candidate.id !== node.id);
  let highestOverlap = 0;

  for (const candidate of comparable) {
    highestOverlap = Math.max(highestOverlap, tokenOverlap(node.content, candidate.content));
  }

  if (highestOverlap >= 0.8) return 20;
  if (highestOverlap >= 0.6) return 45;
  if (highestOverlap >= 0.45) return 70;
  return 100;
}

function scoreNodeQuality(node: ThoughtNodeModel, map: ThoughtMapModel): NodeQualityScore {
  const dimensions = {
    specificity: scoreSpecificity(node),
    concreteness: scoreConcreteness(node),
    nonGeneric: scoreNonGeneric(node),
    tension: scoreTension(node),
    redundancy: redundancyPenalty(node, map),
  };

  const total = Math.round(
    (dimensions.specificity +
      dimensions.concreteness +
      dimensions.nonGeneric +
      dimensions.tension +
      dimensions.redundancy) /
      5,
  );

  const issues: string[] = [];
  if (dimensions.specificity < 45) issues.push("Low specificity");
  if (dimensions.concreteness < 45) issues.push("Low concreteness");
  if (dimensions.nonGeneric < 50) issues.push("Generic wording");
  if (dimensions.tension < 45) issues.push("Low tension or weak challenge");
  if (dimensions.redundancy < 60) issues.push("Overlaps with other nodes");

  return {
    nodeId: node.id,
    kind: node.kind,
    content: node.content,
    total,
    dimensions,
    issues,
  };
}

function scoreConcretenessCoverage(map: ThoughtMapModel) {
  const concrete = map.nodes.filter((node) => hasConcreteSignal(node.content)).length;
  return Math.min(100, concrete * 18);
}

function scoreStakesCoverage(map: ThoughtMapModel) {
  const stakes = map.nodes.filter((node) => node.kind === "why_it_matters" && hasStakeSignal(node.content))
    .length;
  return Math.min(100, stakes * 35);
}

function scoreOpposition(nodeCounts: Record<ThoughtNodeKind, number>) {
  return Math.min(100, nodeCounts.counter_argument * 28);
}

function scoreEvidence(nodeCounts: Record<ThoughtNodeKind, number>, map: ThoughtMapModel) {
  const researchNodes = map.nodes.filter((node) => node.kind === "research");
  const researchQuality = researchNodes.filter((node) => hasEvidenceSignal(node.content)).length;
  return Math.min(100, Math.max(nodeCounts.research * 10, researchQuality * 25));
}

function scoreBalance(nodeCounts: Record<ThoughtNodeKind, number>) {
  const support = nodeCounts.core_claim + nodeCounts.why_it_matters + nodeCounts.assumption;
  const opposition = nodeCounts.counter_argument + nodeCounts.research;

  if (support === 0 && opposition === 0) return 0;

  const ratio = opposition / Math.max(support, 1);
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}

function rankGaps(coverage: GraphCoverageScore) {
  return Object.entries(coverage)
    .sort((a, b) => a[1] - b[1])
    .map(([gap]) => gap as GapType);
}

function targetWeakNode(params: {
  node: ThoughtNodeModel;
  weakNodes: NodeQualityScore[];
  action: NodeAction;
}) {
  const related = params.weakNodes.find((candidate) => candidate.nodeId === params.node.id);
  if (related) return related;

  if (params.action === "challenge") {
    return params.weakNodes.find(
      (candidate) =>
        candidate.kind === "core_claim" ||
        candidate.kind === "assumption" ||
        candidate.kind === "why_it_matters",
    );
  }

  if (params.action === "concretize") {
    return params.weakNodes.find(
      (candidate) =>
        candidate.kind === "core_claim" ||
        candidate.kind === "research" ||
        candidate.kind === "why_it_matters",
    );
  }

  return params.weakNodes[0];
}

function chooseActionSelection(params: {
  node: ThoughtNodeModel;
  weakNodes: NodeQualityScore[];
  repetitiveNodes: NodeQualityScore[];
  action: NodeAction;
}): GraphGapAnalysis["actionSelection"] {
  const weakTarget = targetWeakNode(params);
  const repetitiveTarget = params.repetitiveNodes.find((candidate) => candidate.nodeId === params.node.id)
    ?? params.repetitiveNodes[0];

  if (repetitiveTarget && params.action === "connect") {
    return {
      mode: "diversify_branches",
      targetNodeId: params.node.parentId ?? params.node.id,
      targetNodeKind: params.node.kind,
      why: ["Sibling branches are getting repetitive, so diversify instead of adding another similar note."],
    };
  }

  if (weakTarget && weakTarget.total < 46) {
    return {
      mode: "replace_weak_branch",
      targetNodeId: weakTarget.nodeId,
      targetNodeKind: weakTarget.kind,
      why: [`A weak ${weakTarget.kind} branch scored ${weakTarget.total} and should be out-competed, not merely extended.`],
    };
  }

  if (weakTarget && weakTarget.total < 60) {
    return {
      mode: "strengthen_branch",
      targetNodeId: weakTarget.nodeId,
      targetNodeKind: weakTarget.kind,
      why: [`A weak ${weakTarget.kind} branch scored ${weakTarget.total} and should be strengthened first.`],
    };
  }

  return {
    mode: "add_children",
    targetNodeId: params.node.id,
    targetNodeKind: params.node.kind,
    why: ["No branch is weak enough to justify replacement, so add new children to the active node."],
  };
}

export function analyzeThoughtMap(params: {
  map: ThoughtMapModel;
  node: ThoughtNodeModel;
  action: NodeAction;
}): GraphGapAnalysis {
  const nodeCounts = countKinds(params.map);
  const nodeQuality = params.map.nodes
    .filter((node) => node.kind !== "root")
    .map((node) => scoreNodeQuality(node, params.map))
    .sort((a, b) => a.total - b.total);
  const weakNodes = nodeQuality.filter((node) => node.total < 58).slice(0, 5);
  const repetitiveNodes = nodeQuality.filter((node) => node.dimensions.redundancy < 60).slice(0, 5);

  const coverage: GraphCoverageScore = {
    opposition: scoreOpposition(nodeCounts),
    evidence: scoreEvidence(nodeCounts, params.map),
    concreteness: scoreConcretenessCoverage(params.map),
    stakes: scoreStakesCoverage(params.map),
    balance: scoreBalance(nodeCounts),
  };

  const missingKinds = (Object.entries(nodeCounts) as Array<[ThoughtNodeKind, number]>)
    .filter(([, count]) => count === 0)
    .map(([kind]) => kind)
    .filter((kind) => kind !== "root");

  const ranked = rankGaps(coverage);
  const primaryGap = ranked[0];
  const secondaryGap = ranked[1] ?? null;
  const reasons: string[] = [];

  if (coverage.opposition < 40) reasons.push("The map has too little real opposition relative to supportive branches.");
  if (coverage.evidence < 40) reasons.push("The map has too few concrete research questions or validation prompts.");
  if (coverage.concreteness < 40) reasons.push("Too many nodes are abstract and lack concrete users, tests, or time bounds.");
  if (coverage.stakes < 40) reasons.push("The map does not clearly show why this matters or what is at risk.");
  if (coverage.balance < 45) reasons.push("Support currently outweighs opposition too heavily.");
  if (weakNodes.length > 0) reasons.push(`The weakest branch scores only ${weakNodes[0].total}, so branch quality is now part of the selection.`);

  const actionSelection = chooseActionSelection({
    node: params.node,
    weakNodes,
    repetitiveNodes,
    action: params.action,
  });

  return {
    primaryGap,
    secondaryGap,
    coverage,
    reasons,
    missingKinds,
    nodeCounts,
    nodeQuality,
    weakNodes,
    repetitiveNodes,
    actionSelection,
  };
}

export function isNearDuplicate(candidate: string, existing: string[]) {
  const normalizedCandidate = normalize(candidate);

  return existing.some((value) => {
    const normalizedExisting = normalize(value);
    if (!normalizedExisting) return false;
    if (normalizedExisting === normalizedCandidate) return true;
    if (normalizedExisting.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedExisting)) {
      return true;
    }
    return tokenOverlap(normalizedCandidate, normalizedExisting) >= 0.72;
  });
}
