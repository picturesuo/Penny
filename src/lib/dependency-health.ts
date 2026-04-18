import { buildClaimDependencyGraph, buildBeliefGenealogy } from "@/lib/penny-insights";
import type {
  DependencyHealth,
  HealthComponent,
  ThoughtMapModel,
  ThoughtNodeModel,
  WeakestLinkEntry,
} from "@/types/thought-map";

type GraphIndex = {
  nodesById: Map<string, ThoughtNodeModel>;
  parentsByNodeId: Map<string, string[]>;
  childrenByNodeId: Map<string, string[]>;
  roundCounts: Map<string, number>;
  descendantCounts: Map<string, number>;
};

export interface DependencyHealthTrailEntry {
  node: ThoughtNodeModel;
  depth: number;
}

export interface DependencyHealthReport {
  health: DependencyHealth;
  chain: DependencyHealthTrailEntry[];
  averageHealth: number;
}

export interface DependencyHealthAggregate {
  health: DependencyHealth;
  reports: DependencyHealthReport[];
  averageHealth: number;
}

const HEALTH_WEIGHTS = {
  confidenceFloor: 25,
  testCoverage: 25,
  evidenceQuality: 20,
  staleness: 15,
  contradictionDensity: 10,
  assumptionCoverage: 5,
} as const;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function confidencePercent(node: ThoughtNodeModel) {
  return Math.max(0, Math.min(100, Math.round((node.scores?.confidence ?? 0) * 100)));
}

function evidencePercent(node: ThoughtNodeModel) {
  return Math.max(0, Math.min(100, Math.round((node.scores?.evidence ?? 0) * 100)));
}

function daysBetween(from: Date, to: Date) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));
}

function buildGraphIndex(map: ThoughtMapModel): GraphIndex {
  const graph = buildClaimDependencyGraph(map);
  const nodesById = new Map(map.nodes.map((node) => [node.id, node] as const));
  const parentsByNodeId = new Map<string, string[]>();
  const childrenByNodeId = new Map<string, string[]>();
  const roundCounts = new Map<string, number>();

  for (const event of map.events) {
    if (event.eventType === "dialectic_round" && event.nodeId) {
      roundCounts.set(event.nodeId, (roundCounts.get(event.nodeId) ?? 0) + 1);
    }
  }

  for (const edge of graph.edges) {
    const parents = parentsByNodeId.get(edge.toNodeId) ?? [];
    parents.push(edge.fromNodeId);
    parentsByNodeId.set(edge.toNodeId, parents);

    const children = childrenByNodeId.get(edge.fromNodeId) ?? [];
    children.push(edge.toNodeId);
    childrenByNodeId.set(edge.fromNodeId, children);
  }

  const descendantCounts = new Map<string, number>();
  const cache = new Map<string, Set<string>>();

  function collectDescendants(nodeId: string, visiting = new Set<string>()): Set<string> {
    const cached = cache.get(nodeId);
    if (cached) {
      return new Set(cached);
    }

    if (visiting.has(nodeId)) {
      return new Set();
    }

    visiting.add(nodeId);
    const descendants = new Set<string>();

    for (const childId of childrenByNodeId.get(nodeId) ?? []) {
      descendants.add(childId);
      for (const grandChildId of collectDescendants(childId, visiting)) {
        descendants.add(grandChildId);
      }
    }

    visiting.delete(nodeId);
    cache.set(nodeId, new Set(descendants));
    return descendants;
  }

  for (const node of map.nodes) {
    descendantCounts.set(node.id, collectDescendants(node.id).size);
  }

  return {
    nodesById,
    parentsByNodeId,
    childrenByNodeId,
    roundCounts,
    descendantCounts,
  };
}

function collectChain(map: ThoughtMapModel, index: GraphIndex, claimId: string) {
  const chain = new Map<string, DependencyHealthTrailEntry>();
  const queue: Array<{ nodeId: string; depth: number }> = [{ nodeId: claimId, depth: 0 }];

  while (queue.length) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const node = index.nodesById.get(current.nodeId);
    if (!node) {
      continue;
    }

    const existing = chain.get(node.id);
    if (existing && existing.depth <= current.depth) {
      continue;
    }

    chain.set(node.id, { node, depth: current.depth });

    for (const parentId of index.parentsByNodeId.get(node.id) ?? []) {
      queue.push({ nodeId: parentId, depth: current.depth + 1 });
    }
  }

  return [...chain.values()].sort((a, b) => a.depth - b.depth || a.node.createdAt.getTime() - b.node.createdAt.getTime());
}

function buildHealthComponents(params: {
  confidenceFloor: number;
  testCoverageRatio: number;
  evidenceQuality: number;
  recentRatio: number;
  contradictionRatio: number;
  assumptionCoverageRatio: number;
}): HealthComponent[] {
  return [
    {
      dimension: "confidence_floor",
      score: params.confidenceFloor > 70 ? 25 : params.confidenceFloor >= 50 ? 15 : 5,
      weight: HEALTH_WEIGHTS.confidenceFloor,
      explanation: `Lowest confidence in the chain is ${params.confidenceFloor}%.`,
    },
    {
      dimension: "test_coverage",
      score: clampScore(params.testCoverageRatio * HEALTH_WEIGHTS.testCoverage),
      weight: HEALTH_WEIGHTS.testCoverage,
      explanation:
        params.testCoverageRatio === 1
          ? "Every claim in the chain has at least one completed dialectic round."
          : `${Math.round(params.testCoverageRatio * 100)}% of the chain has at least one completed dialectic round.`,
    },
    {
      dimension: "evidence_quality",
      score: clampScore((params.evidenceQuality / 100) * HEALTH_WEIGHTS.evidenceQuality),
      weight: HEALTH_WEIGHTS.evidenceQuality,
      explanation: `Average evidence quality across the chain is ${Math.round(params.evidenceQuality)}%.`,
    },
    {
      dimension: "staleness",
      score: clampScore(params.recentRatio * HEALTH_WEIGHTS.staleness),
      weight: HEALTH_WEIGHTS.staleness,
      explanation:
        params.recentRatio === 1
          ? "Every claim in the chain was updated within the last 90 days."
          : `${Math.round(params.recentRatio * 100)}% of the chain was updated within the last 90 days.`,
    },
    {
      dimension: "contradiction_density",
      score: clampScore((1 - params.contradictionRatio) * HEALTH_WEIGHTS.contradictionDensity),
      weight: HEALTH_WEIGHTS.contradictionDensity,
      explanation:
        params.contradictionRatio === 0
          ? "No active contradiction pressure was detected in the chain."
          : `${Math.round(params.contradictionRatio * 100)}% of the chain carries active contradiction pressure.`,
    },
    {
      dimension: "assumption_coverage",
      score: clampScore(params.assumptionCoverageRatio * HEALTH_WEIGHTS.assumptionCoverage),
      weight: HEALTH_WEIGHTS.assumptionCoverage,
      explanation:
        params.assumptionCoverageRatio === 1
          ? "All upstream assumptions have been questioned or promoted."
          : `${Math.round(params.assumptionCoverageRatio * 100)}% of upstream assumptions have been questioned or promoted.`,
    },
  ];
}

function buildWeakestLink(params: {
  claimId: string;
  claimText: string;
  confidence: number;
  dialecticRoundCount: number;
  daysSinceUpdate: number;
  downstreamCount: number;
  maxDownstreamCount: number;
}) {
  const confidenceRisk = 1 - clamp01(params.confidence / 100);
  const testRisk = params.dialecticRoundCount > 0 ? 0 : 1;
  const stalenessRisk = clamp01(params.daysSinceUpdate / 90);
  const downstreamRisk = params.maxDownstreamCount > 0 ? params.downstreamCount / params.maxDownstreamCount : 0;
  const riskScore = clampScore((confidenceRisk * 0.4 + testRisk * 0.3 + stalenessRisk * 0.2 + downstreamRisk * 0.1) * 100);

  return {
    claimId: params.claimId,
    claimText: params.claimText,
    claimConfidence: params.confidence,
    dialecticRoundCount: params.dialecticRoundCount,
    daysSinceUpdate: params.daysSinceUpdate,
    downstreamImpact: params.downstreamCount,
    riskScore,
    riskReason:
      params.dialecticRoundCount === 0
        ? `This claim is the weakest link because it has 0 critique rounds, ${params.confidence}% confidence, and ${params.downstreamCount} downstream claims depend on it.`
        : `This claim remains the weakest link because it has ${params.dialecticRoundCount} critique rounds, ${params.confidence}% confidence, and ${params.downstreamCount} downstream claims depend on it.`,
  } satisfies WeakestLinkEntry;
}

function buildTargetHealth(map: ThoughtMapModel, index: GraphIndex, targetId: string, chain: DependencyHealthTrailEntry[]): DependencyHealth {
  const now = new Date();
  const targetNode = index.nodesById.get(targetId);
  const chainDepth = Math.max(0, ...chain.map((entry) => entry.depth));
  const totalDependencies = chain.length;
  const untestedDependencies = chain.filter((entry) => (index.roundCounts.get(entry.node.id) ?? 0) === 0).length;
  const lowConfidenceDependencies = chain.filter((entry) => confidencePercent(entry.node) < 60).length;
  const staleDependencies = chain.filter((entry) => daysBetween(entry.node.updatedAt, now) > 90).length;
  const contradictionCount = chain.filter((entry) => {
    const genealogy = buildBeliefGenealogy(map.nodes, entry.node.id);
    return genealogy.contradictions.some((contradiction) => contradiction.nodeStatus !== "superseded");
  }).length;
  const contradictionRatio = totalDependencies === 0 ? 0 : contradictionCount / totalDependencies;
  const assumptions = chain.filter((entry) => entry.node.kind === "assumption");
  const assumptionCoverageRatio =
    assumptions.length === 0
      ? 1
      : assumptions.filter((entry) => (index.roundCounts.get(entry.node.id) ?? 0) > 0 || (index.descendantCounts.get(entry.node.id) ?? 0) > 0).length /
        assumptions.length;
  const recentRatio = totalDependencies === 0 ? 0 : chain.filter((entry) => daysBetween(entry.node.updatedAt, now) <= 90).length / totalDependencies;
  const confidenceFloor = chain.length ? Math.min(...chain.map((entry) => confidencePercent(entry.node))) : 0;
  const testCoverageRatio = totalDependencies === 0 ? 0 : chain.filter((entry) => (index.roundCounts.get(entry.node.id) ?? 0) > 0).length / totalDependencies;
  const evidenceQuality = totalDependencies === 0 ? 0 : chain.reduce((sum, entry) => sum + evidencePercent(entry.node), 0) / totalDependencies;
  const healthComponents = buildHealthComponents({
    confidenceFloor,
    testCoverageRatio,
    evidenceQuality,
    recentRatio,
    contradictionRatio,
    assumptionCoverageRatio,
  });
  const healthScore = clampScore(healthComponents.reduce((sum, component) => sum + component.score, 0));
  const downstreamCounts = chain.map((entry) => index.descendantCounts.get(entry.node.id) ?? 0);
  const maxDownstreamCount = Math.max(0, ...downstreamCounts);
  const weakestLink = chain.reduce<WeakestLinkEntry | null>((current, entry) => {
    const candidate = buildWeakestLink({
      claimId: entry.node.id,
      claimText: entry.node.content,
      confidence: confidencePercent(entry.node),
      dialecticRoundCount: index.roundCounts.get(entry.node.id) ?? 0,
      daysSinceUpdate: daysBetween(entry.node.updatedAt, now),
      downstreamCount: index.descendantCounts.get(entry.node.id) ?? 0,
      maxDownstreamCount,
    });

    return !current || candidate.riskScore > current.riskScore ? candidate : current;
  }, null) ?? {
    claimId: targetId,
    claimText: targetNode?.content ?? "",
    claimConfidence: 0,
    dialecticRoundCount: 0,
    daysSinceUpdate: 0,
    downstreamImpact: 0,
    riskScore: 0,
    riskReason: "No dependency data was available for this claim.",
  };

  return {
    claimId: targetId,
    mapId: map.id,
    healthScore,
    weakestLink,
    chainDepth,
    totalDependencies,
    untestedDependencies,
    lowConfidenceDependencies,
    contradictionRisk: clampScore(contradictionRatio * 100),
    staleDependencies,
    healthComponents,
    computedAt: now,
  };
}

export function buildDependencyHealthReport(map: ThoughtMapModel, claimId: string): DependencyHealthReport {
  const index = buildGraphIndex(map);
  const chain = collectChain(map, index, claimId);
  const health = buildTargetHealth(map, index, claimId, chain);
  const averageHealth = chain.length
    ? Math.round(
        chain.reduce((sum, entry) => {
          const entryReport = buildTargetHealth(map, index, entry.node.id, collectChain(map, index, entry.node.id));
          return sum + entryReport.healthScore;
        }, 0) / chain.length,
      )
    : 0;

  return {
    health,
    chain,
    averageHealth,
  };
}

export function buildArtifactDependencyHealth(map: ThoughtMapModel, claimIds: string[], artifactId: string): DependencyHealthAggregate {
  const index = buildGraphIndex(map);
  const reports = claimIds.map((claimId) => buildDependencyHealthReport(map, claimId)).filter((report) => report.chain.length > 0);

  if (reports.length === 0) {
    const health: DependencyHealth = {
      claimId: artifactId,
      mapId: map.id,
      healthScore: 0,
      weakestLink: {
        claimId: artifactId,
        claimText: "No load-bearing claims were identified.",
        claimConfidence: 0,
        dialecticRoundCount: 0,
        daysSinceUpdate: 0,
        downstreamImpact: 0,
        riskScore: 0,
        riskReason: "The artifact was generated without a load-bearing dependency chain.",
      },
      chainDepth: 0,
      totalDependencies: 0,
      untestedDependencies: 0,
      lowConfidenceDependencies: 0,
      contradictionRisk: 0,
      staleDependencies: 0,
      healthComponents: buildHealthComponents({
        confidenceFloor: 0,
        testCoverageRatio: 0,
        evidenceQuality: 0,
        recentRatio: 0,
        contradictionRatio: 1,
        assumptionCoverageRatio: 0,
      }),
      computedAt: new Date(),
    };

    return {
      health,
      reports: [],
      averageHealth: 0,
    };
  }

  const allChainEntries = reports.flatMap((report) => report.chain);
  const uniqueEntries = new Map<string, DependencyHealthTrailEntry>();
  for (const entry of allChainEntries) {
    uniqueEntries.set(entry.node.id, entry);
  }

  const entries = [...uniqueEntries.values()];
  const averageHealth = Math.round(reports.reduce((sum, report) => sum + report.health.healthScore, 0) / reports.length);
  const weakestLink = reports.reduce<WeakestLinkEntry | null>((current, report) => {
    return !current || report.health.weakestLink.riskScore > current.riskScore ? report.health.weakestLink : current;
  }, null) ?? {
    claimId: artifactId,
    claimText: "No load-bearing claims were identified.",
    claimConfidence: 0,
    dialecticRoundCount: 0,
    daysSinceUpdate: 0,
    downstreamImpact: 0,
    riskScore: 0,
    riskReason: "The artifact was generated without a load-bearing dependency chain.",
  };

  const mapId = map.id;
  const healthComponents = buildHealthComponents({
    confidenceFloor: entries.length ? Math.min(...entries.map((entry) => confidencePercent(entry.node))) : 0,
    testCoverageRatio: entries.length ? entries.filter((entry) => (index.roundCounts.get(entry.node.id) ?? 0) > 0).length / entries.length : 0,
    evidenceQuality: entries.length ? entries.reduce((sum, entry) => sum + evidencePercent(entry.node), 0) / entries.length : 0,
    recentRatio: entries.length ? entries.filter((entry) => daysBetween(entry.node.updatedAt, new Date()) <= 90).length / entries.length : 0,
    contradictionRatio:
      entries.length === 0
        ? 0
        : entries.filter((entry) => buildBeliefGenealogy(map.nodes, entry.node.id).contradictions.some((contradiction) => contradiction.nodeStatus !== "superseded")).length / entries.length,
    assumptionCoverageRatio:
      entries.filter((entry) => entry.node.kind === "assumption").length === 0
        ? 1
        : entries.filter(
            (entry) =>
              entry.node.kind === "assumption" &&
              ((index.roundCounts.get(entry.node.id) ?? 0) > 0 || (index.descendantCounts.get(entry.node.id) ?? 0) > 0),
          ).length / entries.filter((entry) => entry.node.kind === "assumption").length,
  });

  return {
    health: {
      claimId: artifactId,
      mapId,
      healthScore: averageHealth,
      weakestLink,
      chainDepth: Math.max(0, ...reports.map((report) => report.health.chainDepth)),
      totalDependencies: entries.length,
      untestedDependencies: entries.filter((entry) => (index.roundCounts.get(entry.node.id) ?? 0) === 0).length,
      lowConfidenceDependencies: entries.filter((entry) => confidencePercent(entry.node) < 60).length,
      contradictionRisk: entries.length
        ? clampScore(
            (entries.filter((entry) => buildBeliefGenealogy(map.nodes, entry.node.id).contradictions.some((contradiction) => contradiction.nodeStatus !== "superseded")).length / entries.length) *
              100,
          )
        : 0,
      staleDependencies: entries.filter((entry) => daysBetween(entry.node.updatedAt, new Date()) > 90).length,
      healthComponents,
      computedAt: new Date(),
    },
    reports,
    averageHealth,
  };
}

export function summarizeDependencyHealth(health: DependencyHealth | null) {
  if (!health) {
    return null;
  }

  return {
    score: health.healthScore,
    weakestLink: health.weakestLink.claimText,
    weakestLinkReason: health.weakestLink.riskReason,
    chainDepth: health.chainDepth,
    totalDependencies: health.totalDependencies,
  };
}
